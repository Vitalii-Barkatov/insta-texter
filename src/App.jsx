import React, { useRef, useState, useEffect } from "react";

// Instagram text-on-photo tool — full settings restored
// - All tools visible again in collapsible sidebar
// - Styled UI with gradient background and clean preview
// - Defaults: Montserrat, min font, lowest vertical position

const IG_SIZES = [
  { key: "portrait", label: "Portrait 4:5 (1080×1350)", w: 1080, h: 1350 },
  { key: "square", label: "Square 1:1 (1080×1080)", w: 1080, h: 1080 },
  { key: "story", label: "Story 9:16 (1080×1920)", w: 1080, h: 1920 },
];

const DEFAULTS = {
  fontFamily: "Montserrat",
  fontWeight: 600,
  lineHeight: 1.34,
  margin: 60,
  vertical: 0.93,
  autoContrast: true,
  textColor: "#ffffff",
  stroke: true,
  size: IG_SIZES[0],
  maxTextArea: 0.6,
  maxFontPx: 44,
};

function loadFont(name) {
  const linkId = `font-${name.replace(/\s+/g, "-")}`;
  if (document.getElementById(linkId)) return;
  const googleOk = ["Inter", "Montserrat", "Poppins", "Roboto"];
  if (googleOk.includes(name)) {
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/\s+/g, "+")}:wght@300;400;500;600;700;800;900&display=swap`;
    document.head.appendChild(link);
  }
}

export default function App() {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [imgEl, setImgEl] = useState(null);
  const [text, setText] = useState("Короткий, сильний, без води.");

  const [fontFamily, setFontFamily] = useState(DEFAULTS.fontFamily);
  const [fontWeight, setFontWeight] = useState(DEFAULTS.fontWeight);
  const [lineHeight, setLineHeight] = useState(DEFAULTS.lineHeight);
  const [margin, setMargin] = useState(DEFAULTS.margin);
  const [vertical, setVertical] = useState(DEFAULTS.vertical);
  const [autoContrast, setAutoContrast] = useState(DEFAULTS.autoContrast);
  const [textColor, setTextColor] = useState(DEFAULTS.textColor);
  const [stroke, setStroke] = useState(DEFAULTS.stroke);
  const [size, setSize] = useState(DEFAULTS.size);
  const [maxTextArea, setMaxTextArea] = useState(DEFAULTS.maxTextArea);
  const [maxFontPx, setMaxFontPx] = useState(DEFAULTS.maxFontPx);

  // Drag-to-reposition image under the frame
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => { loadFont(fontFamily); }, [fontFamily]);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => { setImgEl(im); setImage(url); };
    im.crossOrigin = "anonymous";
    im.src = url;
  }

  function pickAutoColor(ctx, w, h) {
    const yStart = Math.floor(h * (1 - maxTextArea));
    const sampleH = h - yStart;
    try {
      const data = ctx.getImageData(0, yStart, w, sampleH).data;
      let L = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const rl = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
        const gl = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
        const bl = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
        L += 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      }
      const avg = L / (data.length / 4);
      return avg > 0.5 ? "#000000" : "#ffffff";
    } catch { return "#ffffff"; }
  }

  // Wrap text by width but PRESERVE explicit new lines from the textarea
  function wrapText(ctx, text, maxWidth, fontPx) {
    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}, system-ui, sans-serif`;
    const paragraphs = String(text).split(/\r?\n/);
    const lines = [];
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p];
      if (para.trim() === "") {
        // Preserve empty line (manual break)
        lines.push("");
        continue;
      }
      const words = para.split(/\s+/);
      let line = "";
      for (let i = 0; i < words.length; i++) {
        const test = line ? line + " " + words[i] : words[i];
        const w = ctx.measureText(test).width;
        if (w > maxWidth && line) {
          lines.push(line);
          line = words[i];
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function findBestFont(ctx, text, w, h, maxFontPx) {
    const contentW = Math.max(1, w - margin * 2);
    const maxAreaH = h * maxTextArea - margin;
    let lo = 8, hi = maxFontPx, best = 24, bestLines = [];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const lines = wrapText(ctx, text, contentW, mid);
      const totalH = lines.length * mid * lineHeight;
      if (totalH <= maxAreaH) { best = mid; bestLines = lines; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    return { fontPx: best, lines: bestLines };
  }

  // Compute image draw rect to cover canvas, returning base position/size
  function getCoverRect(canvas, imageEl) {
    const imgRatio = imageEl.width / imageEl.height;
    const canRatio = canvas.width / canvas.height;
    let drawW, drawH, baseDx, baseDy;
    if (imgRatio > canRatio) {
      drawH = canvas.height;
      drawW = imgRatio * drawH;
      baseDx = (canvas.width - drawW) / 2;
      baseDy = 0;
    } else {
      drawW = canvas.width;
      drawH = drawW / imgRatio;
      baseDx = 0;
      baseDy = (canvas.height - drawH) / 2;
    }
    return { drawW, drawH, baseDx, baseDy };
  }

  // Clamp offset so the canvas is always fully covered (no gaps)
  function clampOffset(offX, offY, canvas, imageEl) {
    const { drawW, drawH } = getCoverRect(canvas, imageEl);
    const minX = canvas.width - drawW;
    const maxX = 0;
    const minY = canvas.height - drawH;
    const maxY = 0;
    const x = Math.min(maxX, Math.max(minX, offX));
    const y = Math.min(maxY, Math.max(minY, offY));
    return { x, y };
  }

  // Pointer/mouse/touch handlers for dragging
  function handlePointerDown(clientX, clientY) {
    dragRef.current.dragging = true;
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
    dragRef.current.startOffsetX = imgOffset.x;
    dragRef.current.startOffsetY = imgOffset.y;
    setIsDragging(true);
  }

  function handlePointerMove(clientX, clientY) {
    if (!dragRef.current.dragging || !canvasRef.current || !imgEl) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    const desiredX = dragRef.current.startOffsetX + dx;
    const desiredY = dragRef.current.startOffsetY + dy;
    const clamped = clampOffset(desiredX, desiredY, canvasRef.current, imgEl);
    setImgOffset(clamped);
  }

  function endDrag() {
    dragRef.current.dragging = false;
    setIsDragging(false);
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { drawW, drawH, baseDx, baseDy } = getCoverRect(canvas, imgEl);
    const dx = baseDx + imgOffset.x;
    const dy = baseDy + imgOffset.y;
    ctx.drawImage(imgEl, dx, dy, drawW, drawH);

    let fill = textColor;
    if (autoContrast) fill = pickAutoColor(ctx, canvas.width, canvas.height);

    const { fontPx, lines } = findBestFont(ctx, text, canvas.width, canvas.height, maxFontPx);

    // Vertical placement: 0 = very top, 1 = very bottom
    const totalH = lines.length * fontPx * lineHeight;
    const availableH = canvas.height - margin * 2;
    const v = Math.min(1, Math.max(0, vertical));
    const top = margin + (availableH - totalH) * v;
    let y = top + totalH; // keep textBaseline="bottom"; y is the baseline of the last line

    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillStyle = fill;

    for (let i = 0; i < lines.length; i++) {
      const yy = y - (lines.length - 1 - i) * fontPx * lineHeight;
      ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}, system-ui, sans-serif`;
      if (stroke) {
        ctx.lineWidth = Math.max(1, Math.floor(fontPx * 0.06));
        ctx.strokeStyle = fill === "#000000" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)";
        ctx.strokeText(lines[i], margin, yy);
      }
      ctx.fillText(lines[i], margin, yy);
    }
  }

  useEffect(() => { draw(); }, [imgEl, image, text, fontFamily, fontWeight, lineHeight, margin, vertical, autoContrast, textColor, stroke, size, maxTextArea, maxFontPx, imgOffset]);

  function download() {
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = `ig_${size.key}.png`;
    a.click();
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100 grid grid-cols-1 md:grid-cols-[320px_1fr]">
      {/* Sidebar */}
      <aside className="bg-neutral-900/60 backdrop-blur border-r border-neutral-800 p-4 md:p-6 flex flex-col min-h-[50vh] md:min-h-screen">
        {/* Centered primary controls */}
        <div className="flex-1 flex items-center">
          <div className="w-full space-y-4">
            {/* Add image button */}
            <label className="cursor-pointer w-full grid place-items-center bg-white text-black rounded-xl px-4 py-3 text-sm font-medium shadow hover:bg-neutral-200 ring-1 ring-neutral-300">
              Додати зображення
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>

            {/* Textarea below */}
            <textarea
              className="w-full h-28 bg-neutral-800/70 border border-neutral-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600"
              value={text}
              onChange={(e)=>setText(e.target.value)}
              placeholder="Введіть текст для накладення..."
            />

            {/* Settings toggle and PNG button stacked */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(v=>!v)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700 ring-1 ring-transparent focus:outline-none focus:ring-2 focus:ring-neutral-500 appearance-none"
              title="Показати/сховати додаткові налаштування"
            >
              <span className="inline-block">Налаштування</span>
              <span className="text-xs">{isSettingsOpen ? '▲ згорнути' : '▼ розгорнути'}</span>
            </button>

            <button
              type="button"
              onClick={download}
              className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-blue-500 text-white shadow hover:bg-blue-600 ring-1 ring-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none"
              title="Експорт PNG"
            >PNG</button>
          </div>
        </div>

        {/* Collapsible advanced settings below (pushes PNG down when open) */}
        {isSettingsOpen && (
          <div className="mt-6 pt-6 border-t border-neutral-800 space-y-4 text-sm">
            <div>
              <label className="block mb-1">Шрифт</label>
              <select value={fontFamily} onChange={(e)=>setFontFamily(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded p-2">
                { ["Montserrat","Inter","Poppins","Roboto"].map(f=>(<option key={f} value={f}>{f}</option>)) }
              </select>
            </div>
            <div>
              <label className="block mb-1">Насиченість</label>
              <input type="range" min={300} max={900} step={100} value={fontWeight} onChange={(e)=>setFontWeight(parseInt(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block mb-1">Міжрядковість</label>
              <input type="range" min={1} max={1.6} step={0.02} value={lineHeight} onChange={(e)=>setLineHeight(parseFloat(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block mb-1">Поля (px)</label>
              <input type="range" min={16} max={120} value={margin} onChange={(e)=>setMargin(parseInt(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block mb-1">Вертик. позиція</label>
              <input type="range" min={0.0} max={1.0} step={0.01} value={vertical} onChange={(e)=>setVertical(parseFloat(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block mb-1">Висота зони тексту</label>
              <input type="range" min={0.3} max={0.6} step={0.01} value={maxTextArea} onChange={(e)=>setMaxTextArea(parseFloat(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block mb-1">Розмір холста</label>
              <select value={size.key} onChange={(e)=>{const found = IG_SIZES.find(s=>s.key===e.target.value); if(found) setSize(found);}} className="w-full bg-neutral-800 border border-neutral-700 rounded p-2">
                {IG_SIZES.map(s=>(<option key={s.key} value={s.key}>{s.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Макс. розмір шрифту</label>
              <input type="range" min={40} max={280} step={2} value={maxFontPx} onChange={(e)=>setMaxFontPx(parseInt(e.target.value))} className="w-full" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={autoContrast} onChange={(e)=>setAutoContrast(e.target.checked)} />
              <span>Авто-контраст</span>
            </div>
            {!autoContrast && (
              <div>
                <label className="block mb-1">Колір тексту</label>
                <input type="color" value={textColor} onChange={(e)=>setTextColor(e.target.value)} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={stroke} onChange={(e)=>setStroke(e.target.checked)} />
              <span>Тонкий обвід</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 bg-neutral-700 text-white rounded-lg px-3 py-2 hover:bg-neutral-600"
                onClick={() => setImgOffset({ x: 0, y: 0 })}
              >Скинути позицію</button>
            </div>
          </div>
        )}
      </aside>

      {/* Preview */}
      <main className="relative p-6 flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-neutral-800 bg-neutral-950">
            <canvas
              ref={canvasRef}
              className={`w-full block bg-black ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (t) handlePointerDown(t.clientX, t.clientY);
              }}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (t) handlePointerMove(t.clientX, t.clientY);
              }}
              onTouchEnd={endDrag}
              onTouchCancel={endDrag}
            />
            {!image && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-neutral-800 grid place-items-center">📷</div>
                  <h3 className="text-base font-semibold">Почніть з фото</h3>
                  <p className="text-sm text-neutral-400">Завантажте фото, введіть текст та відрегулюйте параметри.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
