(() => {
  "use strict";

  const encoder = new TextEncoder();
  const imagePromiseCache = new Map();
  let exporting = false;
  let toastTimer = 0;

  const els = {
    open: document.getElementById("openExportDialog"),
    modal: document.getElementById("exportModal"),
    backdrop: document.getElementById("exportModalBackdrop"),
    close: document.getElementById("exportDialogClose"),
    scope: document.getElementById("exportScopeText"),
    grid: document.getElementById("exportFormatGrid"),
    selectionModes: [...document.querySelectorAll('input[name="exportSelectionMode"]')],
    selectedModeText: document.getElementById("exportSelectedModeText"),
    progress: document.getElementById("exportProgress"),
    progressTitle: document.getElementById("exportProgressTitle"),
    progressPercent: document.getElementById("exportProgressPercent"),
    progressBar: document.getElementById("exportProgressBar"),
    progressDetail: document.getElementById("exportProgressDetail"),
    toast: document.getElementById("exportToast")
  };

  function inventoryApp() {
    return window.InventoryApp || null;
  }

  function exportMode() {
    const active = els.selectionModes.find((input) => input.checked);
    return active ? active.value : "filtered";
  }

  function updateSelectionModeState() {
    const app = inventoryApp();
    if (!app) return;
    const info = app.getSelectionState ? app.getSelectionState() : { selectedCount: 0, hasSelection: false };
    const selectedOption = els.selectionModes.find((input) => input.value === "selected");
    if (selectedOption) {
      selectedOption.disabled = !info.hasSelection;
      if (!info.hasSelection && selectedOption.checked) {
        const filteredOption = els.selectionModes.find((input) => input.value === "filtered");
        if (filteredOption) filteredOption.checked = true;
      }
    }
    if (els.selectedModeText) {
      els.selectedModeText.textContent = info.hasSelection
        ? `MÃ ĐÃ CHỌN (${new Intl.NumberFormat("vi-VN").format(info.selectedCount)})`
        : "MÃ ĐÃ CHỌN";
    }
  }

  function showToast(message, isError = false, duration = 4500) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("is-error", isError);
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, duration);
  }

  function setProgress(percent, title, detail) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    els.progress.hidden = false;
    els.progressTitle.textContent = title || "ĐANG XỬ LÝ";
    els.progressPercent.textContent = `${value}%`;
    els.progressBar.style.width = `${value}%`;
    els.progressDetail.textContent = detail || "";
  }

  function resetProgress() {
    els.progress.hidden = true;
    setProgress(0, "ĐANG CHUẨN BỊ", "Đang chuẩn bị dữ liệu...");
    els.progress.hidden = true;
  }

  function setExporting(value) {
    exporting = value;
    els.grid.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    els.close.disabled = value;
    els.backdrop.disabled = value;
  }

  function updateScope() {
    const app = inventoryApp();
    if (!app) return;
    const context = app.getFilterContext();
    const details = [context.scopeLabel || context.group];
    if (context.search) details.push(`từ khóa “${context.search}”`);
    if (context.stock !== "all") {
      const labels = { out: "hết hàng", low: "tồn 1–3", medium: "tồn 4–10", high: "tồn trên 10" };
      details.push(labels[context.stock] || context.stock);
    }
    const selection = app.getSelectionState ? app.getSelectionState() : { selectedCount: 0, filteredCount: context.count, hasSelection: false };
    const count = exportMode() === "selected" && selection.hasSelection ? selection.selectedCount : context.count;
    els.scope.textContent = `${details.join(" · ")} · ${new Intl.NumberFormat("vi-VN").format(count)} mã sẽ được xuất.`;
    updateSelectionModeState();
  }

  function openModal() {
    const app = inventoryApp();
    const selection = app?.getSelectionState ? app.getSelectionState() : { hasSelection: false };
    const preferred = els.selectionModes.find((input) => input.value === (selection.hasSelection ? "selected" : "filtered"));
    if (preferred && !preferred.disabled) preferred.checked = true;
    updateScope();
    resetProgress();
    els.modal.hidden = false;
    document.body.classList.add("is-export-open");
    const first = els.grid.querySelector("button");
    if (first) first.focus();
  }

  function closeModal() {
    if (exporting) return;
    els.modal.hidden = true;
    document.body.classList.remove("is-export-open");
    els.open.focus();
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function cleanText(value) {
    return String(value ?? "")
      .replace(/^\s*["']|["']\s*$/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
  }

  function fileSafe(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "D")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 54) || "KET_QUA";
  }

  function dateStamp() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
  }

  function displayDate() {
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date());
  }

  function exportBaseName(context) {
    const pieces = ["TON_KHO"];
    if (context.subgroupKey && context.subgroupKey !== "ALL") {
      pieces.push(context.subgroupGroup || context.group, context.subgroup);
    } else {
      pieces.push(context.groupCode === "ALL" ? "TAT_CA" : context.group);
    }
    if (context.search) pieces.push(context.search);
    pieces.push(`${context.count}_MA`, dateStamp());
    return pieces.map(fileSafe).filter(Boolean).join("_");
  }

  function productStatus(product) {
    const output = [];
    if (product.isLegacyStock) output.push("TỒN");
    if (product.isNewOrder) output.push("NEW ORDER");
    if (product.isNew || /VN$/i.test(String(product.code || ""))) output.push("NEW");
    else if (product.isDiscontinued) output.push("NSX");
    return output.join(" · ") || "ĐANG BÁN";
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function productStatusTokens(product) {
    const tokens = [];
    if (product.isLegacyStock) tokens.push("TỒN");
    if (product.isNewOrder) tokens.push("NEW ORDER");
    if (product.isNew || /VN$/i.test(String(product.code || ""))) tokens.push("NEW");
    else if (product.isDiscontinued) tokens.push("NSX");
    return tokens;
  }

  function compactSpecificationLines(value) {
    const text = cleanText(value);
    if (!text) return ["Chưa có thông số kỹ thuật"];
    const normalized = text
      .replace(/\s*[•●▪]+\s*/g, "\n")
      .replace(/\s*;\s*/g, "\n")
      .replace(/\s*\|\s*/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
    const rawLines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!rawLines.length) return ["Chưa có thông số kỹ thuật"];
    return rawLines.map((line) => line.replace(/^[-–—]+\s*/, "")).slice(0, 80);
  }

  function bytesFrom(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (typeof value === "string") return encoder.encode(value);
    return new Uint8Array(value || []);
  }

  function concatBytes(parts) {
    const arrays = parts.map(bytesFrom);
    const total = arrays.reduce((sum, item) => sum + item.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    arrays.forEach((item) => { output.set(item, offset); offset += item.length; });
    return output;
  }

  function writeUint16(view, offset, value) { view.setUint16(offset, value, true); }
  function writeUint32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  function makeZip(fileEntries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const stamp = dosDateTime();

    fileEntries.forEach((entry) => {
      const name = encoder.encode(entry.name.replace(/\\/g, "/"));
      const data = bytesFrom(entry.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      writeUint32(lv, 0, 0x04034b50);
      writeUint16(lv, 4, 20);
      writeUint16(lv, 6, 0x0800);
      writeUint16(lv, 8, 0);
      writeUint16(lv, 10, stamp.time);
      writeUint16(lv, 12, stamp.day);
      writeUint32(lv, 14, crc);
      writeUint32(lv, 18, data.length);
      writeUint32(lv, 22, data.length);
      writeUint16(lv, 26, name.length);
      writeUint16(lv, 28, 0);
      local.set(name, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      writeUint32(cv, 0, 0x02014b50);
      writeUint16(cv, 4, 20);
      writeUint16(cv, 6, 20);
      writeUint16(cv, 8, 0x0800);
      writeUint16(cv, 10, 0);
      writeUint16(cv, 12, stamp.time);
      writeUint16(cv, 14, stamp.day);
      writeUint32(cv, 16, crc);
      writeUint32(cv, 20, data.length);
      writeUint32(cv, 24, data.length);
      writeUint16(cv, 28, name.length);
      writeUint16(cv, 30, 0);
      writeUint16(cv, 32, 0);
      writeUint16(cv, 34, 0);
      writeUint16(cv, 36, 0);
      writeUint32(cv, 38, 0);
      writeUint32(cv, 42, localOffset);
      central.set(name, 46);
      centralParts.push(central);
      localOffset += local.length + data.length;
    });

    const centralBytes = concatBytes(centralParts);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    writeUint32(ev, 0, 0x06054b50);
    writeUint16(ev, 4, 0);
    writeUint16(ev, 6, 0);
    writeUint16(ev, 8, fileEntries.length);
    writeUint16(ev, 10, fileEntries.length);
    writeUint32(ev, 12, centralBytes.length);
    writeUint32(ev, 16, localOffset);
    writeUint16(ev, 20, 0);
    return concatBytes([...localParts, centralBytes, end]);
  }

  async function requestSaveTarget(format, baseName) {
    const specs = {
      xlsx: { filename: `${baseName}.xlsx`, description: "Microsoft Excel", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensions: [".xlsx"] },
      docx: { filename: `${baseName}.docx`, description: "Microsoft Word", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensions: [".docx"] },
      pdf: { filename: `${baseName}.pdf`, description: "Tài liệu PDF", mime: "application/pdf", extensions: [".pdf"] },
      png: { filename: `${baseName}_PNG.zip`, description: "Bộ ảnh PNG", mime: "application/zip", extensions: [".zip"] }
    };
    const spec = specs[format];
    if (!spec) throw new Error("Định dạng xuất không hợp lệ.");

    try {
      if (format === "png" && window.showDirectoryPicker) {
        const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        return { ...spec, directoryHandle };
      }
      if (format !== "png" && window.showSaveFilePicker) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: spec.filename,
          types: [{ description: spec.description, accept: { [spec.mime]: spec.extensions } }]
        });
        return { ...spec, fileHandle };
      }
    } catch (error) {
      if (error && error.name === "AbortError") return { ...spec, cancelled: true };
      console.warn("Không dùng được hộp thoại chọn nơi lưu; chuyển sang tải xuống mặc định.", error);
    }
    return spec;
  }

  async function saveBlob(blob, filename, description, mime, extensions, fileHandle = null) {
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, picker: true };
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    return { saved: true, picker: false };
  }

  async function fetchWithTimeout(url, timeout = 22000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: "force-cache", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function blobToPngBytes(blob, maxSize = 300) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      const src = URL.createObjectURL(blob);
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
      URL.revokeObjectURL(src);
      bitmap = image;
    }
    const sourceWidth = bitmap.width || bitmap.naturalWidth || maxSize;
    const sourceHeight = bitmap.height || bitmap.naturalHeight || maxSize;
    const scale = Math.min(maxSize / sourceWidth, maxSize / sourceHeight, 1);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = maxSize;
    canvas.height = maxSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, maxSize, maxSize);
    ctx.drawImage(bitmap, Math.round((maxSize - width) / 2), Math.round((maxSize - height) / 2), width, height);
    if (bitmap.close) bitmap.close();
    const png = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Không chuyển được ảnh sang PNG")), "image/png", 0.92));
    return new Uint8Array(await png.arrayBuffer());
  }

  async function loadProductImage(product) {
    const url = String(product.image || "").trim();
    if (!url) return null;
    if (imagePromiseCache.has(url)) return imagePromiseCache.get(url);

    const promise = (async () => {
      const candidates = [];
      const localHost = location.protocol.startsWith("http") && /^(?:127\.0\.0\.1|localhost)$/i.test(location.hostname);
      if (localHost && /^https?:\/\//i.test(url)) candidates.push(`/__image?url=${encodeURIComponent(url)}`);
      candidates.push(url);
      if (/^https?:\/\//i.test(url)) {
        candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=420&h=420&fit=contain&output=png`);
      }
      let lastError = null;
      for (const candidate of candidates) {
        try {
          const blob = await fetchWithTimeout(candidate);
          if (!blob.type.startsWith("image/") && blob.size < 128) throw new Error("Phản hồi không phải ảnh");
          return await blobToPngBytes(blob);
        } catch (error) {
          lastError = error;
        }
      }
      console.warn(`Không tải được ảnh ${product.code}`, lastError);
      return null;
    })();

    imagePromiseCache.set(url, promise);
    return promise;
  }

  async function preloadImages(products, startPercent = 5, endPercent = 48) {
    const output = new Map();
    if (!products.length) return output;
    let cursor = 0;
    let completed = 0;
    const workerCount = Math.min(4, products.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < products.length) {
        const index = cursor;
        cursor += 1;
        const product = products[index];
        const bytes = await loadProductImage(product);
        if (bytes) output.set(product.code, bytes);
        completed += 1;
        const percent = startPercent + ((endPercent - startPercent) * completed / products.length);
        setProgress(percent, "ĐANG TẢI HÌNH ẢNH", `${completed}/${products.length} mã · ${product.code}`);
      }
    });
    await Promise.all(workers);
    return output;
  }

  function colLetter(number) {
    let n = number;
    let output = "";
    while (n > 0) {
      n -= 1;
      output = String.fromCharCode(65 + (n % 26)) + output;
      n = Math.floor(n / 26);
    }
    return output;
  }

  function inlineCell(ref, text, style = 0) {
    const preserve = /^\s|\s$|\n/.test(String(text ?? ""));
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t${preserve ? ' xml:space="preserve"' : ""}>${xmlEscape(text)}</t></is></c>`;
  }

  function numberCell(ref, value, style = 0) {
    return `<c r="${ref}" s="${style}"><v>${Number(value || 0)}</v></c>`;
  }

  function estimateWrappedLineCount(text, maxChars = 54) {
    return cleanText(text).split("\n").reduce((sum, line) => {
      const length = Math.max(1, line.length || 1);
      return sum + Math.max(1, Math.ceil(length / maxChars));
    }, 0);
  }

  function buildXlsx(products, imageMap, context, meta) {
    const files = [];
    const media = [];
    const anchors = [];
    const drawingRels = [];
    let imageIndex = 0;

    const rows = [];
    rows.push(`<row r="1" ht="34" customHeight="1">${inlineCell("A1", "BÁO CÁO TỒN KHO JPK VÕ · BRAVAT", 1)}</row>`);
    rows.push(`<row r="2" ht="22" customHeight="1">${inlineCell("A2", `${context.scopeLabel || context.group} · ${products.length} mã · Xuất lúc ${displayDate()}`, 2)}</row>`);
    rows.push(`<row r="3" ht="8" customHeight="1"></row>`);
    const headers = ["STT", "NHÓM HÀNG", "NHÓM PHỤ", "HÌNH ẢNH", "MÃ SẢN PHẨM", "TÊN SẢN PHẨM", "GIÁ NIÊM YẾT", "TỒN KHO", "TRẠNG THÁI", "THÔNG SỐ KỸ THUẬT"];
    rows.push(`<row r="4" ht="30" customHeight="1">${headers.map((header, i) => inlineCell(`${colLetter(i + 1)}4`, header, 3)).join("")}</row>`);

    products.forEach((product, index) => {
      const row = index + 5;
      const specLines = compactSpecificationLines(product.specifications);
      const specs = specLines.map((line) => `• ${line}`).join("\n");
      const statusText = productStatusTokens(product).join(" · ");
      const rowHeight = Math.min(210, Math.max(112, 18 * Math.max(4, estimateWrappedLineCount(specs, 58)) + 20));
      const codeCell = statusText ? `${statusText}\n${product.code}` : product.code;
      const cells = [
        numberCell(`A${row}`, index + 1, 4),
        inlineCell(`B${row}`, product.group, 5),
        inlineCell(`C${row}`, product.subgroup, 5),
        inlineCell(`D${row}`, imageMap.has(product.code) ? "" : "CHƯA CÓ ẢNH", 6),
        inlineCell(`E${row}`, codeCell, 7),
        inlineCell(`F${row}`, cleanText(product.name), 5),
        numberCell(`G${row}`, product.listPrice, 8),
        numberCell(`H${row}`, product.quantity, 9),
        inlineCell(`I${row}`, statusText || "ĐANG BÁN", 10),
        inlineCell(`J${row}`, specs, 5)
      ];
      rows.push(`<row r="${row}" ht="${rowHeight}" customHeight="1">${cells.join("")}</row>`);

      const imageBytes = imageMap.get(product.code);
      if (imageBytes) {
        imageIndex += 1;
        media.push({ name: `xl/media/image${imageIndex}.png`, data: imageBytes });
        drawingRels.push(`<Relationship Id="rId${imageIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageIndex}.png"/>`);
        anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>120000</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>80000</xdr:rowOff></xdr:from><xdr:ext cx="1200000" cy="1200000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${imageIndex}" name="${xmlEscape(product.code)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${imageIndex}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1200000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
      }
    });

    const maxRow = products.length + 4;
    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="2" width="23" customWidth="1"/><col min="3" max="3" width="15" customWidth="1"/><col min="4" max="4" width="21" customWidth="1"/><col min="5" max="5" width="25" customWidth="1"/><col min="6" max="6" width="38" customWidth="1"/><col min="7" max="7" width="19" customWidth="1"/><col min="8" max="8" width="11" customWidth="1"/><col min="9" max="9" width="18" customWidth="1"/><col min="10" max="10" width="62" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="2"><mergeCell ref="A1:J1"/><mergeCell ref="A2:J2"/></mergeCells><autoFilter ref="A4:J${maxRow}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>${anchors.length ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0 [$₫-vi-VN]"/></numFmts><fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF6B4307"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF7A241C"/><name val="Arial"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A1D10"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE5A5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE3D6C2"/></left><right style="thin"><color rgb="FFE3D6C2"/></right><top style="thin"><color rgb="FFE3D6C2"/></top><bottom style="thin"><color rgb="FFE3D6C2"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

    files.push(
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${anchors.length ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Báo cáo tồn kho JPK Võ</dc:title><dc:creator>JPK VÕ</dc:creator><cp:lastModifiedBy>JPK VÕ</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
      { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>JPK VÕ Inventory Export</Application></Properties>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="KẾT QUẢ LỌC" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: stylesXml },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml }
    );

    if (anchors.length) {
      files.push(
        { name: "xl/worksheets/_rels/sheet1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
        { name: "xl/drawings/drawing1.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>` },
        { name: "xl/drawings/_rels/drawing1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>` }
      );
    }
    files.push(...media);
    return new Blob([makeZip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function wordParagraph(text, options = {}) {
    const { bold = false, size = 20, color = "2B2116", align = "left", spacingAfter = 70, shading = "" } = options;
    const pPr = `<w:pPr><w:jc w:val="${align}"/><w:spacing w:after="${spacingAfter}"/>${shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : ""}</w:pPr>`;
    return `<w:p>${pPr}<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
  }

  function wordImage(rId, id, name) {
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="2057400" cy="2057400"/><wp:docPr id="${id}" name="${xmlEscape(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2057400" cy="2057400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  function wordCell(content, width, fill = "FFFFFF") {
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcShd w:fill="${fill}"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;
  }

  function wordImageSized(rId, id, name, cx = 1080000, cy = 1080000) {
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xmlEscape(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  function wordTableCell(content, width, fill = "FFFFFF", align = "left") {
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcShd w:fill="${fill}"/><w:vAlign w:val="center"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;
  }

  function wordHeaderCell(textValue, width) {
    return wordTableCell(wordParagraph(textValue, { bold: true, size: 15, color: "FFFFFF", align: "center", spacingAfter: 0 }), width, "4B2F08", "center");
  }

  function buildDocx(products, imageMap, context) {
    const files = [];
    const relationships = [`<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`];
    const media = [];
    let imageIndex = 0;
    const body = [];

    body.push(wordParagraph("BÁO CÁO TỒN KHO JPK VÕ · BRAVAT", { bold: true, size: 28, color: "2B1D0D", align: "center", spacingAfter: 70 }));
    body.push(wordParagraph(`${context.scopeLabel || context.group} · ${products.length} mã · ${displayDate()}`, { bold: true, size: 17, color: "8A5A0B", align: "center", spacingAfter: 120 }));

    const widths = [520, 1450, 1650, 1650, 3000, 1550, 780, 3300];
    const headers = ["STT", "HÌNH ẢNH", "NHÓM", "MÃ SẢN PHẨM", "TÊN SẢN PHẨM", "GIÁ NY", "TỒN", "THÔNG SỐ KỸ THUẬT"];
    const headerRow = headers.map((header, index) => wordHeaderCell(header, widths[index])).join("");
    const rows = [`<w:tr><w:trPr><w:tblHeader/></w:trPr>${headerRow}</w:tr>`];

    products.forEach((product, index) => {
      const imageBytes = imageMap.get(product.code);
      let imageContent;
      if (imageBytes) {
        imageIndex += 1;
        const rId = `rIdImg${imageIndex}`;
        relationships.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imageIndex}.png"/>`);
        media.push({ name: `word/media/image${imageIndex}.png`, data: imageBytes });
        imageContent = wordImageSized(rId, imageIndex + 20, product.code);
      } else {
        imageContent = wordParagraph("CHƯA CÓ ẢNH", { bold: true, size: 14, color: "8B7E6D", align: "center", spacingAfter: 0 });
      }
      const status = productStatusTokens(product).join(" · ");
      const codeContent = [
        status ? wordParagraph(status, { bold: true, size: 12, color: "8A5A0B", spacingAfter: 25 }) : "",
        wordParagraph(product.code, { bold: true, size: 16, color: "3D2708", spacingAfter: 0 })
      ].join("");
      const specs = compactSpecificationLines(product.specifications).slice(0, 8)
        .map((line) => wordParagraph(`• ${line}`, { size: 13, color: "4F473D", spacingAfter: 14 }))
        .join("");
      const cells = [
        wordTableCell(wordParagraph(String(index + 1), { bold: true, size: 15, align: "center", spacingAfter: 0 }), widths[0], index % 2 ? "FFF9EF" : "FFFFFF", "center"),
        wordTableCell(imageContent, widths[1], index % 2 ? "FFF9EF" : "FFFFFF", "center"),
        wordTableCell(wordParagraph(`${product.group}\n${product.subgroup}`, { bold: true, size: 13, color: "6F4A0C", spacingAfter: 0 }), widths[2], index % 2 ? "FFF9EF" : "FFFFFF"),
        wordTableCell(codeContent, widths[3], index % 2 ? "FFF9EF" : "FFFFFF"),
        wordTableCell(wordParagraph(cleanText(product.name), { bold: true, size: 14, color: "21170B", spacingAfter: 0 }), widths[4], index % 2 ? "FFF9EF" : "FFFFFF"),
        wordTableCell(wordParagraph(formatMoney(product.listPrice), { bold: true, size: 14, color: "5F3A05", align: "right", spacingAfter: 0 }), widths[5], index % 2 ? "FFF9EF" : "FFFFFF", "right"),
        wordTableCell(wordParagraph(String(product.quantity), { bold: true, size: 15, color: "21170B", align: "center", spacingAfter: 0 }), widths[6], index % 2 ? "FFF9EF" : "FFFFFF", "center"),
        wordTableCell(specs, widths[7], index % 2 ? "FFF9EF" : "FFFFFF")
      ].join("");
      rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`);
    });

    const table = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="5" w:color="D8C8AF"/><w:left w:val="single" w:sz="5" w:color="D8C8AF"/><w:bottom w:val="single" w:sz="5" w:color="D8C8AF"/><w:right w:val="single" w:sz="5" w:color="D8C8AF"/><w:insideH w:val="single" w:sz="3" w:color="E7DCCB"/><w:insideV w:val="single" w:sz="3" w:color="E7DCCB"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
    body.push(table);

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="16840" w:h="11900" w:orient="landscape"/><w:pgMar w:top="420" w:right="420" w:bottom="420" w:left="420" w:header="220" w:footer="220" w:gutter="0"/></w:sectPr></w:body></w:document>`;

    files.push(
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Báo cáo tồn kho JPK Võ</dc:title><dc:creator>JPK VÕ</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
      { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>JPK VÕ Inventory Export</Application></Properties>` },
      { name: "word/document.xml", data: documentXml },
      { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>` },
      { name: "word/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/></w:style></w:styles>` },
      ...media
    );
    return new Blob([makeZip(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const output = [];
    const paragraphs = cleanText(text).split("\n");
    paragraphs.forEach((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { output.push(""); return; }
      let line = "";
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
        else { output.push(line); line = word; }
      });
      if (line) output.push(line);
    });
    return output.length ? output : ["Chưa có thông số kỹ thuật"];
  }

  async function imageBitmapFromBytes(bytes) {
    if (!bytes) return null;
    try { return await createImageBitmap(new Blob([bytes], { type: "image/png" })); }
    catch { return null; }
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawContain(ctx, image, x, y, width, height) {
    const sourceWidth = image.width || image.naturalWidth || width;
    const sourceHeight = image.height || image.naturalHeight || height;
    const ratio = Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * ratio;
    const drawHeight = sourceHeight * ratio;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  }

  function drawStatusBadges(ctx, badges, startX, topY) {
    let x = startX;
    badges.forEach((label) => {
      const width = Math.max(56, ctx.measureText(label).width + 22);
      let fill = '#17946d';
      if (label === 'NSX') fill = '#8a3a1d';
      else if (label === 'TỒN') fill = '#8d5f0c';
      else if (label === 'NEW ORDER') fill = '#3d2b0a';
      ctx.fillStyle = fill;
      roundedRect(ctx, x, topY, width, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(label, x + 11, topY + 16);
      x += width + 8;
    });
    return x;
  }

  async function loadLocalLogo(path) {
    try { return await blobToPngBytes(await fetchWithTimeout(path, 8000), 260); }
    catch { return null; }
  }


  function normalizeLine(line) {
    return cleanText(line).replace(/^[•●▪\-]+\s*/, "").replace(/^\.+\s*/, "").replace(/\s+/g, " ").trim();
  }

  function afterColon(line) {
    const value = normalizeLine(line);
    const index = value.indexOf(":");
    return index >= 0 ? value.slice(index + 1).trim() : value;
  }

  function extractDimension(textValue) {
    const match = String(textValue || "").match(/(\d+\s*[x×*]\s*\d+\s*[x×*]\s*\d+\s*mm)/i);
    return match ? match[1].replace(/\s*[x×*]\s*/g, "x") : "";
  }

  function specItemForLine(line) {
    const value = normalizeLine(line);
    const lower = value.toLowerCase();
    if (/(^|\b)(size|dimension|dimensions|kich thuoc)\b/i.test(value) || /^\d+\s*[x×*]\s*\d+\s*[x×*]\s*\d+/i.test(value)) return { type: "size", label: "KÍCH THƯỚC", value: afterColon(value) };
    if (/(rough|trap|lap dat|installation|outlet|s-trap|p-trap|wall[- ]?hung|floor[- ]?mounted)/i.test(lower)) return { type: "install", label: "LẮP ĐẶT", value: afterColon(value) };
    if (/(flushing|flush|siphon|washdown|xả|jet)/i.test(lower)) return { type: "flush", label: "XẢ NƯỚC", value: afterColon(value) };
    if (/(seat|cover|lid|nắp|ghế)/i.test(lower)) return { type: "seat", label: "NẮP / GHẾ", value: afterColon(value) };
    if (/(pressure|áp lực)/i.test(lower)) return { type: "pressure", label: "ÁP LỰC", value: afterColon(value) };
    if (/(material|ceramic|brass|inox|đồng|sứ)/i.test(lower)) return { type: "material", label: "CHẤT LIỆU", value: afterColon(value) };
    return { type: "note", label: "GHI CHÚ", value: afterColon(value) };
  }

  function buildSpecCards(product) {
    const items = [];
    const labels = new Set();
    const dimension = extractDimension(product?.name || "");
    if (dimension) {
      items.push({ type: "size", label: "KÍCH THƯỚC", value: dimension });
      labels.add("KÍCH THƯỚC");
    }
    compactSpecificationLines(product?.specifications || "").forEach((line) => {
      const item = specItemForLine(line);
      if (!item.value || labels.has(item.label)) return;
      labels.add(item.label);
      items.push(item);
    });
    if (!items.length) items.push({ type: "note", label: "THÔNG SỐ", value: "Chưa có thông số kỹ thuật" });
    const order = { "KÍCH THƯỚC": 1, "LẮP ĐẶT": 2, "XẢ NƯỚC": 3, "NẮP / GHẾ": 4, "ÁP LỰC": 5, "CHẤT LIỆU": 6, "GHI CHÚ": 7, "THÔNG SỐ": 8 };
    items.sort((a, b) => (order[a.label] || 99) - (order[b.label] || 99));
    return items.slice(0, 6);
  }

  function fitCanvasLines(ctx, textValue, maxWidth, maxLines = 2) {
    const lines = wrapCanvasText(ctx, cleanText(textValue), maxWidth).filter(Boolean);
    if (lines.length <= maxLines) return lines;
    const output = lines.slice(0, maxLines);
    let last = output[maxLines - 1];
    while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trim();
    output[maxLines - 1] = `${last}…`;
    return output;
  }

  function stockLevel(quantity) {
    const value = Number(quantity || 0);
    if (value <= 0) return "out";
    if (value <= 3) return "low";
    if (value <= 10) return "medium";
    return "high";
  }

  function drawIconTile(ctx, x, y, size, type) {
    ctx.fillStyle = "#402809";
    roundedRect(ctx, x, y, size, size, 14);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 2.2;
    const cx = x + size / 2;
    const cy = y + size / 2;
    if (type === "price") {
      ctx.font = "bold 21px Arial"; ctx.fillText("₫", x + 13, y + 28); return;
    }
    if (type === "stock") {
      ctx.strokeRect(x + 10, y + 11, size - 20, size - 18);
      ctx.beginPath(); ctx.moveTo(x + 10, y + 18); ctx.lineTo(x + size - 10, y + 18); ctx.stroke(); return;
    }
    if (type === "size") {
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 17); ctx.lineTo(x + 10, y + 10); ctx.lineTo(x + 17, y + 10);
      ctx.moveTo(x + size - 10, y + 17); ctx.lineTo(x + size - 10, y + 10); ctx.lineTo(x + size - 17, y + 10);
      ctx.moveTo(x + 10, y + size - 17); ctx.lineTo(x + 10, y + size - 10); ctx.lineTo(x + 17, y + size - 10);
      ctx.moveTo(x + size - 10, y + size - 17); ctx.lineTo(x + size - 10, y + size - 10); ctx.lineTo(x + size - 17, y + size - 10);
      ctx.stroke(); return;
    }
    if (type === "install") {
      ctx.beginPath(); ctx.moveTo(cx, y + 9); ctx.lineTo(cx, y + size - 9); ctx.moveTo(cx - 8, y + 11); ctx.lineTo(cx + 8, y + 11); ctx.moveTo(cx - 8, y + size - 11); ctx.lineTo(cx + 8, y + size - 11); ctx.stroke(); return;
    }
    if (type === "flush") {
      ctx.beginPath(); ctx.moveTo(cx, y + 8); ctx.bezierCurveTo(x + size - 8, y + 20, x + size - 8, y + 31, cx, y + size - 8); ctx.bezierCurveTo(x + 8, y + 31, x + 8, y + 20, cx, y + 8); ctx.stroke(); return;
    }
    if (type === "seat") {
      ctx.beginPath(); ctx.arc(cx, cy - 2, 10, 0.2 * Math.PI, 0.8 * Math.PI, true); ctx.moveTo(x + 12, cy + 2); ctx.quadraticCurveTo(cx, y + size - 5, x + size - 12, cy + 2); ctx.stroke(); return;
    }
    if (type === "pressure") {
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.moveTo(cx, cy); ctx.lineTo(cx + 7, cy - 5); ctx.stroke(); return;
    }
    if (type === "material") {
      ctx.beginPath(); ctx.moveTo(x + 11, y + size - 10); ctx.lineTo(x + 16, y + 10); ctx.lineTo(cx, y + 24); ctx.lineTo(x + size - 16, y + 10); ctx.lineTo(x + size - 11, y + size - 10); ctx.closePath(); ctx.stroke(); return;
    }
    ctx.strokeRect(x + 10, y + 9, size - 20, size - 18);
    ctx.beginPath(); ctx.moveTo(x + 14, y + 17); ctx.lineTo(x + size - 14, y + 17); ctx.moveTo(x + 14, y + 24); ctx.lineTo(x + size - 14, y + 24); ctx.stroke();
  }

  function drawSpecCard(ctx, item, x, y, width, height) {
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, "rgba(255,255,255,.98)");
    gradient.addColorStop(1, "rgba(250,247,242,.92)");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#ebe3d7";
    ctx.lineWidth = 1.25;
    roundedRect(ctx, x, y, width, height, 16);
    ctx.fill(); ctx.stroke();
    drawIconTile(ctx, x + 10, y + 12, 38, item.type || "note");
    ctx.fillStyle = "#8c7248";
    ctx.font = "bold 10px Arial";
    ctx.fillText(item.label, x + 58, y + 24);
    ctx.fillStyle = "#23180d";
    ctx.font = "17px Arial";
    fitCanvasLines(ctx, item.value, width - 68, 2).forEach((line, index) => ctx.fillText(line, x + 58, y + 47 + index * 18));
  }

  function drawMetric(ctx, x, y, width, height, type, label, value, accent) {
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#faf6ee");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#e9dfd0";
    ctx.lineWidth = 1.3;
    roundedRect(ctx, x, y, width, height, 17);
    ctx.fill(); ctx.stroke();
    drawIconTile(ctx, x + 10, y + 10, 40, type);
    ctx.fillStyle = "#8c7248";
    ctx.font = "bold 10px Arial";
    ctx.fillText(label, x + 61, y + 22);
    ctx.fillStyle = accent;
    ctx.font = width > 250 ? "bold 23px Arial" : "bold 26px Arial";
    ctx.fillText(value, x + 61, y + 48);
  }

  function paginateProducts(products, perPage = 3) {
    const pages = [];
    for (let index = 0; index < products.length; index += perPage) pages.push(products.slice(index, index + perPage));
    return pages;
  }

  function drawPageHeader(ctx, context) {
    ctx.shadowColor = "rgba(57,37,8,.10)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    const gradient = ctx.createLinearGradient(34, 22, 1766, 122);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.72, "#fffdfb");
    gradient.addColorStop(1, "#faf4ea");
    ctx.fillStyle = gradient;
    roundedRect(ctx, 34, 22, 1732, 110, 26);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#ece4da"; ctx.lineWidth = 1.4; roundedRect(ctx, 34, 22, 1732, 110, 26); ctx.stroke();
    const accent = ctx.createLinearGradient(54, 0, 400, 0);
    accent.addColorStop(0, "#3a2508"); accent.addColorStop(1, "#c88b26");
    ctx.fillStyle = accent; roundedRect(ctx, 54, 38, 8, 78, 4); ctx.fill();
    ctx.fillStyle = "#17120d"; ctx.font = "bold 31px Arial"; ctx.fillText("TỒN KHO KHẢ DỤNG", 284, 65);
    ctx.fillStyle = "#9a6814"; ctx.font = "bold 15px Arial"; ctx.fillText(`${context.scopeLabel || context.group} · ${context.count} MÃ`, 284, 91);
    ctx.fillStyle = "#85796b"; ctx.font = "14px Arial"; ctx.fillText(`Cập nhật ${displayDate()} · Giá niêm yết chưa gồm VAT 8%`, 284, 114);
    ctx.fillStyle = "#f5eee3"; roundedRect(ctx, 1385, 48, 342, 58, 18); ctx.fill();
    ctx.fillStyle = "#6c5634"; ctx.font = "bold 13px Arial"; ctx.fillText("JPK VÕ · BRAVAT", 1450, 83);
  }

  async function drawHeaderLogos(ctx, logos) {
    let x = 76;
    for (const logoBytes of logos) {
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#e8ded0"; ctx.lineWidth = 1.2; roundedRect(ctx, x, 43, 88, 68, 15); ctx.fill(); ctx.stroke();
      if (logoBytes) {
        const bitmap = await imageBitmapFromBytes(logoBytes);
        if (bitmap) { drawContain(ctx, bitmap, x + 10, 52, 68, 50); bitmap.close?.(); }
      }
      x += 100;
    }
  }

  async function renderVerticalProductCard(ctx, product, globalIndex, x, y, width, height, imageMap) {
    ctx.shadowColor = "rgba(46,29,5,.12)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    const bg = ctx.createLinearGradient(x, y, x, y + height);
    bg.addColorStop(0, "rgba(255,255,255,.98)");
    bg.addColorStop(0.7, "rgba(255,255,255,.94)");
    bg.addColorStop(1, "rgba(249,246,252,.96)");
    ctx.fillStyle = bg; roundedRect(ctx, x, y, width, height, 28); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.strokeStyle = "#e9e1d6"; ctx.lineWidth = 1.5; roundedRect(ctx, x, y, width, height, 28); ctx.stroke();

    const innerX = x + 22;
    const innerW = width - 44;
    ctx.fillStyle = "#f5eee5"; roundedRect(ctx, innerX, y + 20, innerW, 34, 17); ctx.fill();
    ctx.fillStyle = "#7a5310"; ctx.font = "bold 13px Arial"; ctx.textAlign = "center"; ctx.fillText(`${product.group} · ${product.subgroup}`, x + width / 2, y + 42); ctx.textAlign = "left";

    const imageY = y + 72;
    const imageH = 346;
    const imageGradient = ctx.createLinearGradient(innerX, imageY, innerX, imageY + imageH);
    imageGradient.addColorStop(0, "rgba(255,255,255,.98)"); imageGradient.addColorStop(1, "rgba(248,244,239,.72)");
    ctx.fillStyle = imageGradient; ctx.strokeStyle = "#eee6dc"; roundedRect(ctx, innerX, imageY, innerW, imageH, 22); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#382307"; roundedRect(ctx, innerX + 14, imageY + 14, 58, 31, 16); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 15px Arial"; ctx.textAlign = "center"; ctx.fillText(String(globalIndex + 1).padStart(2, "0"), innerX + 43, imageY + 35); ctx.textAlign = "left";

    const bitmap = await imageBitmapFromBytes(imageMap.get(product.code));
    if (bitmap) { drawContain(ctx, bitmap, innerX + 28, imageY + 52, innerW - 56, imageH - 74); bitmap.close?.(); }
    else { ctx.fillStyle = "#8b7f70"; ctx.font = "bold 17px Arial"; ctx.textAlign = "center"; ctx.fillText("CHƯA CÓ ẢNH", x + width / 2, imageY + imageH / 2); ctx.textAlign = "left"; }

    const codeY = y + 454;
    ctx.fillStyle = "#1f160d";
    const codeFontSize = String(product.code || "").length > 17 ? 20 : 24;
    ctx.font = `bold ${codeFontSize}px Arial`;
    ctx.fillText(product.code, innerX, codeY);
    const codeWidth = ctx.measureText(product.code).width;
    const badges = productStatusTokens(product);
    if (badges.length) { ctx.font = "bold 11px Arial"; drawStatusBadges(ctx, badges, Math.min(innerX + codeWidth + 10, x + width - 135), codeY - 19); }

    ctx.fillStyle = "#2b2117"; ctx.font = "bold 19px Arial";
    fitCanvasLines(ctx, product.name, innerW, 2).forEach((line, index) => ctx.fillText(line, innerX, y + 490 + index * 23));

    const metricY = y + 544;
    const stockAccent = { out: "#827565", low: "#b4231c", medium: "#96630b", high: "#0b7c61" }[stockLevel(product.quantity)];
    drawMetric(ctx, innerX, metricY, 322, 66, "price", "GIÁ NIÊM YẾT", formatMoney(product.listPrice), "#704807");
    drawMetric(ctx, innerX + 334, metricY, innerW - 334, 66, "stock", "TỒN", String(product.quantity), stockAccent);

    const specY = y + 626;
    const gap = 10;
    const cols = 2;
    const specW = Math.floor((innerW - gap) / cols);
    const specH = 104;
    buildSpecCards(product).forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      drawSpecCard(ctx, item, innerX + col * (specW + gap), specY + row * (specH + gap), specW, specH);
    });

    const footerY = y + height - 38;
    const accentGradient = ctx.createLinearGradient(x + 34, footerY, x + width - 34, footerY);
    accentGradient.addColorStop(0, "#cf4b8d"); accentGradient.addColorStop(.5, "#7b64d9"); accentGradient.addColorStop(1, "#d6a022");
    ctx.fillStyle = accentGradient; roundedRect(ctx, x + 34, footerY, width - 68, 8, 4); ctx.fill();
  }

  async function renderReportPage(pageProducts, pageIndex, pageCount, imageMap, context, logos, outputType) {
    const canvas = document.createElement("canvas");
    canvas.width = 1800; canvas.height = 1273;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fdfdfd"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const backdrop = ctx.createRadialGradient(900, 100, 100, 900, 600, 1200);
    backdrop.addColorStop(0, "rgba(255,249,241,.9)"); backdrop.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawPageHeader(ctx, context);
    await drawHeaderLogos(ctx, logos);

    const marginX = 36;
    const gap = 18;
    const cardWidth = 564;
    const cardY = 154;
    const cardHeight = 1054;
    for (let index = 0; index < pageProducts.length; index += 1) {
      const x = marginX + index * (cardWidth + gap);
      await renderVerticalProductCard(ctx, pageProducts[index], pageIndex * 3 + index, x, cardY, cardWidth, cardHeight, imageMap);
    }

    ctx.fillStyle = "#8a8074"; ctx.font = "13px Arial";
    ctx.fillText("CTY TNHH JPK VÕ · 0946 122822 · jpkvo.com", 42, 1251);
    ctx.textAlign = "right"; ctx.fillText(`Trang ${pageIndex + 1}/${pageCount}`, 1758, 1251); ctx.textAlign = "left";
    const mime = outputType === "png" ? "image/png" : "image/jpeg";
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không tạo được trang báo cáo")), mime, outputType === "png" ? undefined : 0.92));
  }

  async function renderReportPages(products, imageMap, context, outputType) {
    const pages = paginateProducts(products, 3);
    const logos = await Promise.all([loadLocalLogo("jpkvo.png"), loadLocalLogo("bravat.png")]);
    const blobs = [];
    for (let index = 0; index < pages.length; index += 1) {
      setProgress(52 + 38 * (index + 1) / Math.max(1, pages.length), "ĐANG DÀN TRANG", `Trang ${index + 1}/${pages.length}`);
      blobs.push(await renderReportPage(pages[index], index, pages.length, imageMap, context, logos, outputType));
    }
    return blobs;
  }

  function buildPdf(jpegBlobs) {
    const pageWidth = 841.89;
    const pageHeight = 595.28;
    const objects = new Map();
    const pageRefs = [];
    let objectId = 3;
    const imageDataPromises = jpegBlobs.map((blob) => blob.arrayBuffer().then((b) => new Uint8Array(b)));
    return Promise.all(imageDataPromises).then((images) => {
      images.forEach((imageBytes) => {
        const pageId = objectId++;
        const imageId = objectId++;
        const contentId = objectId++;
        pageRefs.push(`${pageId} 0 R`);
        objects.set(pageId, encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
        const imageHead = encoder.encode(`<< /Type /XObject /Subtype /Image /Width 1800 /Height 1273 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
        objects.set(imageId, concatBytes([imageHead, imageBytes, encoder.encode("\nendstream")]));
        const stream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;
        objects.set(contentId, encoder.encode(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`));
      });
      objects.set(1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));
      objects.set(2, encoder.encode(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`));

      const parts = [encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
      const offsets = [0];
      let offset = parts[0].length;
      const maxId = objectId - 1;
      for (let id = 1; id <= maxId; id += 1) {
        offsets[id] = offset;
        const obj = concatBytes([encoder.encode(`${id} 0 obj\n`), objects.get(id), encoder.encode("\nendobj\n")]);
        parts.push(obj);
        offset += obj.length;
      }
      const xrefOffset = offset;
      let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
      for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
      xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      parts.push(encoder.encode(xref));
      return new Blob([concatBytes(parts)], { type: "application/pdf" });
    });
  }

  async function savePngPages(pageBlobs, baseName, directoryHandle = null) {
    if (directoryHandle) {
      const folder = await directoryHandle.getDirectoryHandle(baseName, { create: true });
      for (let i = 0; i < pageBlobs.length; i += 1) {
        setProgress(92 + 7 * (i + 1) / pageBlobs.length, "ĐANG LƯU PNG", `Trang ${i + 1}/${pageBlobs.length}`);
        const handle = await folder.getFileHandle(`${baseName}_TRANG_${String(i + 1).padStart(3, "0")}.png`, { create: true });
        const writable = await handle.createWritable();
        await writable.write(pageBlobs[i]);
        await writable.close();
      }
      return { saved: true, picker: true, folder: true };
    }
    const entries = [];
    for (let i = 0; i < pageBlobs.length; i += 1) {
      entries.push({ name: `${baseName}_TRANG_${String(i + 1).padStart(3, "0")}.png`, data: new Uint8Array(await pageBlobs[i].arrayBuffer()) });
    }
    entries.push({ name: "HUONG_DAN.txt", data: `Bộ ảnh PNG gồm ${pageBlobs.length} trang, được xuất theo kết quả lọc trên website tồn kho JPK Võ.` });
    const zipBlob = new Blob([makeZip(entries)], { type: "application/zip" });
    return saveBlob(zipBlob, `${baseName}_PNG.zip`, "Bộ ảnh PNG", "application/zip", [".zip"]);
  }

  async function performExport(format) {
    const app = inventoryApp();
    if (!app) throw new Error("Dữ liệu tồn kho chưa sẵn sàng.");
    const mode = exportMode();
    const products = app.getExportProducts ? app.getExportProducts(mode) : app.getFilteredProducts();
    const context = { ...app.getFilterContext() };
    const meta = app.getMeta();
    const selection = app.getSelectionState ? app.getSelectionState() : { selectedCount: 0 };
    if (!products.length) throw new Error(mode === "selected" ? "Bạn chưa chọn mã nào để xuất." : "Không có sản phẩm phù hợp để xuất.");
    if (mode === "selected") {
      context.count = products.length;
      context.scopeLabel = `${context.scopeLabel} · ĐÃ CHỌN`;
    }
    const baseName = exportBaseName(context);
    const saveTarget = await requestSaveTarget(format, baseName);
    if (saveTarget.cancelled) {
      setProgress(0, "ĐÃ HỦY", "Bạn đã đóng hộp thoại chọn nơi lưu.");
      showToast("Đã hủy xuất file.");
      return;
    }

    setExporting(true);
    setProgress(2, "ĐANG CHUẨN BỊ", `Đang chuẩn bị ${products.length} mã...`);
    const imageMap = await preloadImages(products);
    const missing = products.filter((product) => product.image && !imageMap.has(product.code)).length;

    let result;
    if (format === "xlsx") {
      setProgress(65, "ĐANG TẠO EXCEL", "Đang dựng bảng và chèn hình ảnh...");
      const blob = buildXlsx(products, imageMap, context, meta);
      setProgress(94, "ĐANG LƯU FILE", `${baseName}.xlsx`);
      result = await saveBlob(blob, `${baseName}.xlsx`, "Microsoft Excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".xlsx"], saveTarget.fileHandle);
    } else if (format === "docx") {
      setProgress(65, "ĐANG TẠO WORD", "Đang dựng catalogue và chèn hình ảnh...");
      const blob = buildDocx(products, imageMap, context);
      setProgress(94, "ĐANG LƯU FILE", `${baseName}.docx`);
      result = await saveBlob(blob, `${baseName}.docx`, "Microsoft Word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"], saveTarget.fileHandle);
    } else if (format === "pdf") {
      const pages = await renderReportPages(products, imageMap, context, "jpeg");
      setProgress(92, "ĐANG TẠO PDF", `Đóng gói ${pages.length} trang...`);
      const blob = await buildPdf(pages);
      setProgress(97, "ĐANG LƯU FILE", `${baseName}.pdf`);
      result = await saveBlob(blob, `${baseName}.pdf`, "Tài liệu PDF", "application/pdf", [".pdf"], saveTarget.fileHandle);
    } else if (format === "png") {
      const pages = await renderReportPages(products, imageMap, context, "png");
      setProgress(92, "ĐANG LƯU PNG", `${pages.length} trang ảnh...`);
      result = await savePngPages(pages, baseName, saveTarget.directoryHandle);
    } else {
      throw new Error("Định dạng xuất không hợp lệ.");
    }

    if (result?.cancelled) {
      setProgress(0, "ĐÃ HỦY", "Bạn đã đóng hộp thoại chọn nơi lưu.");
      showToast("Đã hủy xuất file.");
      return;
    }
    setProgress(100, "HOÀN TẤT", missing ? `Đã xuất file; ${missing} ảnh không tải được nên dùng ô thay thế.` : "Đã xuất đầy đủ dữ liệu và hình ảnh.");
    showToast(missing ? `Xuất file thành công. Có ${missing} ảnh không tải được và đã được thay bằng ô “CHƯA CÓ ẢNH”.` : "Xuất file thành công.");
  }

  async function onFormatClick(event) {
    const button = event.target.closest("[data-export-format]");
    if (!button || exporting) return;
    try {
      await performExport(button.dataset.exportFormat);
    } catch (error) {
      console.error(error);
      setProgress(0, "XUẤT FILE THẤT BẠI", error?.message || "Đã xảy ra lỗi không xác định.");
      showToast(error?.message || "Không thể xuất file.", true, 6500);
    } finally {
      setExporting(false);
    }
  }

  window.InventoryExporter = Object.freeze({ export: performExport, open: openModal });

  els.open.addEventListener("click", openModal);
  els.backdrop.addEventListener("click", closeModal);
  els.close.addEventListener("click", closeModal);
  els.grid.addEventListener("click", onFormatClick);
  els.selectionModes.forEach((input) => input.addEventListener("change", updateScope));
  window.addEventListener("inventory-filter-changed", updateScope);
  window.addEventListener("inventory-selection-changed", updateScope);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.modal.hidden && !exporting) closeModal();
  });
})();
