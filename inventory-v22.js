(() => {
  "use strict";

  const ALL_GROUPS = "ALL";
  const ALL_SUBGROUPS = "ALL";
  const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const numberFormatter = new Intl.NumberFormat("vi-VN");
  const GROUP_META = {
    "TOILET": { shortLabel: "TOILET", icon: "toilet" },
    "LAVABO": { shortLabel: "LAVABO", icon: "lavabo" },
    "VÒI CHẬU": { shortLabel: "VÒI CHẬU", icon: "faucet" },
    "VÒI BẾP": { shortLabel: "VÒI BẾP", icon: "kitchenfaucet" },
    "SEN TẮM GẮN TƯỜNG": { shortLabel: "SEN GẮN TƯỜNG", icon: "shower" },
    "SEN TẮM ÂM TƯỜNG": { shortLabel: "SEN ÂM TƯỜNG", icon: "rainshower" },
    "TIỂU NAM": { shortLabel: "TIỂU NAM", icon: "urinal" },
    "CHẬU BẾP": { shortLabel: "CHẬU BẾP", icon: "sink" },
    "CỦ CHÔN ÂM": { shortLabel: "CỦ CHÔN ÂM", icon: "valve" },
    "PHỤ KIỆN": { shortLabel: "PHỤ KIỆN", icon: "accessories" },
    "BỒN TẮM": { shortLabel: "BỒN TẮM", icon: "bathtub" }
  };

  const state = {
    data: window.INVENTORY_DATA || { meta: {}, groups: [], products: [] },
    assetMap: mergeAssetMaps(window.INVENTORY_IMAGE_MAP || {}, window.INVENTORY_ASSET_MAP || {}),
    specMap: normalizeSpecManifest(window.INVENTORY_SPEC_MANIFEST || {}),
    activeGroup: ALL_GROUPS,
    activeSubgroup: ALL_SUBGROUPS,
    search: "",
    stock: "all",
    sort: "recommended",
    pageSize: 10,
    page: 1,
    activePreview: null,
    activeSpec: null,
    previewPinned: false,
    specPinned: false,
    previewTimer: 0,
    specTimer: 0,
    imageLoadToken: 0,
    imageLoadTimer: 0,
    selectedCodes: new Set()
  };

  const els = {
    updatedAt: document.getElementById("updatedAt"),
    kpiProducts: document.getElementById("kpiProducts"),
    kpiQuantity: document.getElementById("kpiQuantity"),
    kpiGroups: document.getElementById("kpiGroups"),
    kpiLowStock: document.getElementById("kpiLowStock"),
    groupSummary: document.getElementById("groupSummary"),
    groupList: document.getElementById("groupList"),
    groupDrawer: document.getElementById("groupDrawer"),
    groupDrawerToggle: document.getElementById("groupDrawerToggle"),
    groupDrawerClose: document.getElementById("groupDrawerClose"),
    groupDrawerBackdrop: document.getElementById("groupDrawerBackdrop"),
    mobileGroupSelect: document.getElementById("mobileGroupSelect"),
    subgroupSelect: document.getElementById("subgroupSelect"),
    search: document.getElementById("inventorySearch"),
    stockFilter: document.getElementById("stockFilter"),
    sortSelect: document.getElementById("sortSelect"),
    resetFilters: document.getElementById("resetFilters"),
    resultTitle: document.getElementById("resultTitle"),
    resultCount: document.getElementById("resultCount"),
    selectAllFilteredBtn: document.getElementById("selectAllFilteredBtn"),
    selectedCompact: document.getElementById("selectedCompact"),
    clearSelection: document.getElementById("clearSelection"),
    selectedCount: document.getElementById("selectedCount"),
    pageSizeSelect: document.getElementById("pageSizeSelect"),
    tableWrap: document.getElementById("tableWrap"),
    tableBody: document.getElementById("inventoryTableBody"),
    mobileList: document.getElementById("inventoryMobileList"),
    empty: document.getElementById("inventoryEmpty"),
    pagination: document.getElementById("pagination"),
    prevPage: document.getElementById("prevPage"),
    nextPage: document.getElementById("nextPage"),
    pageNumbers: document.getElementById("pageNumbers"),
    preview: document.getElementById("imagePreview"),
    previewImage: document.getElementById("previewImage"),
    previewPlaceholder: document.getElementById("previewPlaceholder"),
    previewLoader: document.getElementById("previewLoader"),
    previewGroup: document.getElementById("previewGroup"),
    previewCode: document.getElementById("previewCode"),
    previewName: document.getElementById("previewName"),
    previewImageButton: document.getElementById("previewImageButton"),
    imageZoomHint: document.getElementById("imageZoomHint"),
    previewActions: document.getElementById("previewActions"),
    openTechnicalDrawing: document.getElementById("openTechnicalDrawing"),
    copyPreviewCode: document.getElementById("copyPreviewCode"),
    imagePreviewClose: document.getElementById("imagePreviewClose"),
    specPreview: document.getElementById("specPreview"),
    specGroup: document.getElementById("specGroup"),
    specCode: document.getElementById("specCode"),
    specName: document.getElementById("specName"),
    specPreviewGrid: document.getElementById("specPreviewGrid"),
    specPreviewClose: document.getElementById("specPreviewClose"),
    floatingPreviewBackdrop: document.getElementById("floatingPreviewBackdrop"),
    modal: document.getElementById("imageModal"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalClose: document.getElementById("modalClose"),
    modalImage: document.getElementById("modalImage"),
    modalProductGroup: document.getElementById("modalProductGroup"),
    modalProductCode: document.getElementById("modalProductCode"),
    modalProductName: document.getElementById("modalProductName"),
    openOriginalImage: document.getElementById("openOriginalImage"),
    backTop: document.getElementById("inventoryBackTop")
  };

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMoney(value) {
    const numericValue = Number(value || 0);
    return numericValue ? currencyFormatter.format(numericValue) : "—";
  }

  function stockLevel(quantity) {
    const value = Number(quantity || 0);
    if (value <= 0) return "out";
    if (value <= 3) return "low";
    if (value <= 10) return "medium";
    return "high";
  }

  function normalizeCodeKey(value) {
    return String(value || "").trim().toUpperCase();
  }

  function normalizeAssetMap(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(Object.entries(source).map(([code, value]) => {
      const key = normalizeCodeKey(code);
      if (typeof value === "string") {
        return [key, { image: value.trim(), technicalDrawing: "" }];
      }
      const item = value && typeof value === "object" ? value : {};
      return [key, {
        image: String(item.image || item.imageUrl || item.photo || "").trim(),
        technicalDrawing: String(item.technicalDrawing || item.drawing || item.technicalFile || item.specFile || "").trim()
      }];
    }));
  }

  function mergeAssetMaps(...sources) {
    const output = {};
    sources.forEach((source) => {
      const normalized = normalizeAssetMap(source);
      Object.entries(normalized).forEach(([code, item]) => {
        const current = output[code] || { image: "", technicalDrawing: "" };
        output[code] = {
          image: item.image || current.image || "",
          technicalDrawing: item.technicalDrawing || current.technicalDrawing || ""
        };
      });
    });
    return output;
  }

  function fileStemFromPath(value) {
    const clean = String(value || "").split(/[?#]/)[0];
    const filename = clean.split("/").pop() || "";
    try {
      return decodeURIComponent(filename).replace(/\.[^.]+$/, "");
    } catch {
      return filename.replace(/\.[^.]+$/, "");
    }
  }

  function normalizeSpecManifest(source) {
    const output = {};
    const input = source && typeof source === "object" && !Array.isArray(source) && source.files
      ? source.files
      : source;

    if (Array.isArray(input)) {
      input.forEach((value) => {
        const path = typeof value === "string" ? value : String(value?.path || value?.url || "").trim();
        if (!path) return;
        const code = normalizeCodeKey(value?.code || fileStemFromPath(path));
        if (code) output[code] = path;
      });
      return output;
    }

    if (!input || typeof input !== "object") return output;
    Object.entries(input).forEach(([code, value]) => {
      const path = typeof value === "string"
        ? value.trim()
        : String(value?.path || value?.url || value?.technicalDrawing || "").trim();
      if (!path) return;
      const key = normalizeCodeKey(code || fileStemFromPath(path));
      if (key) output[key] = path;
    });
    return output;
  }

  function mergeSpecMaps(...maps) {
    return Object.assign({}, ...maps.filter(Boolean));
  }

  function assetFor(code) {
    const key = normalizeCodeKey(code);
    const asset = state.assetMap[key] || { image: "", technicalDrawing: "" };
    return {
      image: asset.image || "",
      technicalDrawing: asset.technicalDrawing || state.specMap[key] || ""
    };
  }

  function orderedGroups() {
    return (state.data.groups || []).filter((group) => group.count > 0);
  }

  function productMap() {
    if (!state._productMap) {
      state._productMap = new Map((state.data.products || []).map((p) => [p.code, p]));
    }
    return state._productMap;
  }

  function productByCode(code) {
    return productMap().get(code) || null;
  }

  function groupByCode(code) {
    return orderedGroups().find((group) => group.code === code) || null;
  }

  function groupMeta(code) {
    return GROUP_META[code] || { shortLabel: code, icon: "box" };
  }

  function iconSvg(name) {
    const icons = {
      toilet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h6v5a3 3 0 0 1-3 3H8z"/><path d="M7 12h9a4 4 0 0 1-4 4H9a2 2 0 0 1-2-2z"/><path d="M12 16v4"/></svg>',
      lavabo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"/><path d="M12 17v3"/><path d="M9 9a3 3 0 0 1 6 0"/></svg>',
      faucet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h11"/><path d="M10 11V8a3 3 0 0 1 3-3h3"/><path d="M18 5v7a3 3 0 0 1-3 3h-2"/><path d="M16 17v2"/></svg>',
      kitchenfaucet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18h9"/><path d="M10 18v-8a4 4 0 0 1 4-4h2"/><path d="M18 6v8a2 2 0 0 1-2 2h-3"/><path d="M16 18v2"/></svg>',
      shower: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h6a4 4 0 0 1 4 4"/><path d="M16 12h2"/><path d="M18 12v2"/><path d="M10 14l-1 2"/><path d="M13 14l-1 2"/><path d="M16 14l-1 2"/></svg>',
      rainshower: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v3H7z"/><path d="M12 10v3"/><path d="M8 14v2"/><path d="M12 14v2"/><path d="M16 14v2"/></svg>',
      urinal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10v4a8 8 0 0 1-8 8H7z"/><path d="M12 17v2"/></svg>',
      sink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M7 8h4"/><path d="M15 6v4"/></svg>',
      valve: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M12 3v6"/><path d="M12 15v6"/><path d="M3 12h6"/><path d="M15 12h6"/></svg>',
      accessories: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8"/><path d="M7 12h10"/><path d="M9 17h6"/><path d="M5 7h1"/><path d="M18 7h1"/><path d="M4 12h1"/><path d="M19 12h1"/><path d="M7 17h1"/><path d="M16 17h1"/></svg>',
      bathtub: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M7 11V7a2 2 0 0 1 2-2h2"/><path d="M9 19v2"/><path d="M17 19v2"/></svg>',
      box: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
      size: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4h4"/><path d="M20 8V4h-4"/><path d="M4 16v4h4"/><path d="M20 16v4h-4"/><path d="M7 7l10 10"/></svg>',
      water: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4s5 5 5 8a5 5 0 0 1-10 0c0-3 5-8 5-8z"/></svg>',
      install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h8"/><path d="M12 6v12"/><path d="M8 18h8"/></svg>',
      electric: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L6 13h5l-1 9 8-12h-5z"/></svg>',
      pressure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16a6 6 0 1 1 12 0"/><path d="M12 10l3 3"/><path d="M12 16v2"/></svg>',
      seat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8a5 5 0 0 1 10 0"/><path d="M8 11h8a4 4 0 0 1-4 4 4 4 0 0 1-4-4z"/></svg>',
      gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M4 12h2"/><path d="M18 12h2"/><path d="M12 4v2"/><path d="M12 18v2"/><path d="M6.3 6.3l1.4 1.4"/><path d="M16.3 16.3l1.4 1.4"/><path d="M17.7 6.3l-1.4 1.4"/><path d="M7.7 16.3l-1.4 1.4"/></svg>',
      material: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/></svg>',
      note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6z"/><path d="M9 9h6"/><path d="M9 13h6"/></svg>'
    };
    return icons[name] || icons.box;
  }

  function iconBadge(groupCode, extraClass = "") {
    const meta = groupMeta(groupCode);
    return `<span class="${extraClass ? `${extraClass} ` : ""}group-icon-chip" title="${escapeHtml(groupCode)}">${iconSvg(meta.icon)}</span>`;
  }

  function renderStats() {
    const products = state.data.products || [];
    const groups = new Set(products.map((item) => item.group));
    const totalQuantity = products.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const lowStock = products.filter((item) => Number(item.quantity || 0) >= 1 && Number(item.quantity || 0) <= 3).length;
    els.updatedAt.textContent = state.data.meta.updatedAt || "—";
    els.groupSummary.textContent = `${groups.size} nhóm`;
    if (els.kpiProducts) els.kpiProducts.textContent = numberFormatter.format(products.length);
    if (els.kpiQuantity) els.kpiQuantity.textContent = numberFormatter.format(totalQuantity);
    if (els.kpiGroups) els.kpiGroups.textContent = numberFormatter.format(groups.size);
    if (els.kpiLowStock) els.kpiLowStock.textContent = numberFormatter.format(lowStock);
  }

  function renderGroups() {
    const groups = orderedGroups();
    const total = state.data.products.length;
    const allButton = `
      <button class="group-button${state.activeGroup === ALL_GROUPS ? " is-active" : ""}" type="button" data-group="${ALL_GROUPS}">
        <span class="group-badge">${iconSvg('box')}</span>
        <span class="group-copy"><strong>TẤT CẢ SẢN PHẨM</strong><small>Hiển thị toàn bộ danh mục</small></span>
        <span class="group-count">${total}</span>
      </button>`;

    els.groupList.innerHTML = allButton + groups.map((group) => {
      const meta = groupMeta(group.code);
      return `
        <button class="group-button${state.activeGroup === group.code ? " is-active" : ""}" type="button" data-group="${escapeHtml(group.code)}">
          <span class="group-badge">${iconSvg(meta.icon)}</span>
          <span class="group-copy">
            <strong>${escapeHtml(meta.shortLabel)}</strong>
            <small>${escapeHtml((group.subgroups || []).join(' · '))}</small>
          </span>
          <span class="group-count">${group.count}</span>
        </button>`;
    }).join("");

    els.mobileGroupSelect.innerHTML = `
      <option value="${ALL_GROUPS}">Tất cả sản phẩm (${total})</option>
      ${groups.map((group) => `<option value="${escapeHtml(group.code)}">${escapeHtml(groupMeta(group.code).shortLabel)} (${group.count})</option>`).join("")}`;
    els.mobileGroupSelect.value = state.activeGroup;
  }

  function subgroupKey(group, subgroup) {
    return `${String(group || "").trim()}::${String(subgroup || "").trim()}`;
  }

  function subgroupOptions() {
    const products = state.data.products || [];
    const counts = new Map();
    products.forEach((product) => {
      if (state.activeGroup !== ALL_GROUPS && product.group !== state.activeGroup) return;
      const key = subgroupKey(product.group, product.subgroup);
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const output = [];
    orderedGroups().forEach((group) => {
      if (state.activeGroup !== ALL_GROUPS && group.code !== state.activeGroup) return;
      (group.subgroups || []).forEach((subgroup) => {
        const key = subgroupKey(group.code, subgroup);
        const count = counts.get(key) || 0;
        if (!count) return;
        output.push({ key, group: group.code, subgroup, count });
      });
    });
    return output;
  }

  function renderSubgroups() {
    if (!els.subgroupSelect) return;
    const options = subgroupOptions();
    const validKeys = new Set(options.map((item) => item.key));
    if (state.activeSubgroup !== ALL_SUBGROUPS && !validKeys.has(state.activeSubgroup)) {
      state.activeSubgroup = ALL_SUBGROUPS;
    }

    const allLabel = state.activeGroup === ALL_GROUPS
      ? `Tất cả nhóm con (${options.length})`
      : `Tất cả nhóm con của ${groupMeta(state.activeGroup).shortLabel}`;
    els.subgroupSelect.innerHTML = `
      <option value="${ALL_SUBGROUPS}">${escapeHtml(allLabel)}</option>
      ${options.map((item) => {
        const label = state.activeGroup === ALL_GROUPS
          ? `${groupMeta(item.group).shortLabel} · ${item.subgroup}`
          : item.subgroup;
        return `<option value="${escapeHtml(item.key)}">${escapeHtml(label)} (${item.count})</option>`;
      }).join("")}`;
    els.subgroupSelect.value = state.activeSubgroup;
  }

  function activeSubgroupInfo() {
    if (state.activeSubgroup === ALL_SUBGROUPS) return null;
    const [group, ...parts] = String(state.activeSubgroup).split("::");
    return { group, subgroup: parts.join("::") };
  }

  function matchesSearch(product) {
    if (!state.search) return true;
    const haystack = normalizeText([
      product.group,
      product.subgroup,
      product.code,
      product.name,
      product.specifications
    ].join(" "));
    return haystack.includes(normalizeText(state.search));
  }

  function matchesStock(product) {
    if (state.stock === "all") return true;
    return stockLevel(product.quantity) === state.stock;
  }

  function compareCode(a, b) {
    return String(a.code).localeCompare(String(b.code), "vi", { numeric: true, sensitivity: "base" });
  }

  function recommendedTier(product) {
    const quantity = Number(product.quantity || 0);
    const isNew = Boolean(product.isNew) || /VN$/i.test(String(product.code || ""));
    const isDiscontinued = Boolean(product.isDiscontinued) && !isNew;

    if (isNew) return 0;
    if (!isDiscontinued && quantity > 0) return 1;
    if (isDiscontinued && quantity > 3) return 2;
    if (!isDiscontinued && quantity <= 0) return 3;
    if (isDiscontinued && quantity > 0) return 4;
    return 5;
  }

  function compareRecommended(a, b) {
    const groups = orderedGroups().map((item) => item.code);
    const groupPosA = groups.indexOf(a.group);
    const groupPosB = groups.indexOf(b.group);
    if (state.activeGroup === ALL_GROUPS && groupPosA !== groupPosB) return groupPosA - groupPosB;

    const tierDiff = recommendedTier(a) - recommendedTier(b);
    if (tierDiff) return tierDiff;

    const quantityDiff = Number(b.quantity || 0) - Number(a.quantity || 0);
    if (quantityDiff) return quantityDiff;

    const groupInfo = groupByCode(a.group);
    const orderA = (groupInfo?.subgroups || []).indexOf(a.subgroup);
    const orderB = (groupInfo?.subgroups || []).indexOf(b.subgroup);
    if (orderA !== orderB) return orderA - orderB;

    const priceDiff = Number(a.listPrice || 0) - Number(b.listPrice || 0);
    return compareCode(a, b) || priceDiff;
  }

  function sortProducts(products) {
    const result = [...products];
    const compareNumber = (key) => (a, b) => Number(a[key] || 0) - Number(b[key] || 0);
    const sorters = {
      recommended: compareRecommended,
      "code-asc": compareCode,
      "code-desc": (a, b) => compareCode(b, a),
      "quantity-asc": compareNumber("quantity"),
      "quantity-desc": (a, b) => compareNumber("quantity")(b, a),
      "price-asc": compareNumber("listPrice"),
      "price-desc": (a, b) => compareNumber("listPrice")(b, a)
    };
    return result.sort(sorters[state.sort] || compareRecommended);
  }

  function filteredProducts() {
    return sortProducts(state.data.products.filter((product) => {
      const groupMatch = state.activeGroup === ALL_GROUPS || product.group === state.activeGroup;
      const subgroup = activeSubgroupInfo();
      const subgroupMatch = !subgroup || (product.group === subgroup.group && product.subgroup === subgroup.subgroup);
      return groupMatch && subgroupMatch && matchesSearch(product) && matchesStock(product);
    }));
  }

  function splitProductName(product) {
    const original = String(product.name || "").replace(/\s+/g, " ").trim();
    const manualMain = String(product.nameMain || "").trim();
    const manualDetail = String(product.nameDetail || "").trim();
    if (manualMain || manualDetail) {
      return { main: manualMain || original, detail: manualDetail };
    }

    const sizeMatch = original.match(/(?:vuông|tròn|oval|chữ nhật)?\s*(?:d?\d+(?:[.,]\d+)?\s*[x×X]\s*)+d?\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|m))?/i);
    if (sizeMatch && sizeMatch.index != null && sizeMatch.index > 0) {
      const main = original.slice(0, sizeMatch.index).replace(/[\s,;:+\-–—]+$/, "").trim();
      const detail = original.slice(sizeMatch.index).replace(/^[\s,;:+\-–—]+/, "").trim();
      if (main && detail) return { main, detail };
    }

    const detailMatch = original.match(/(?:\s*[|;–—-]\s*|,\s*)(?=(?:kèm|đi kèm|bao gồm|gồm|có kèm)\b)/i);
    if (detailMatch && detailMatch.index != null) {
      const cut = detailMatch.index;
      const main = original.slice(0, cut).trim();
      const detail = original.slice(cut + detailMatch[0].length).trim();
      if (main && detail) return { main, detail };
    }

    const keywordMatch = original.match(/\s+(?=(?:kèm|đi kèm|bao gồm|gồm|có kèm)\b)/i);
    if (keywordMatch && keywordMatch.index != null && keywordMatch.index > 0) {
      const main = original.slice(0, keywordMatch.index).trim();
      const detail = original.slice(keywordMatch.index).trim();
      if (main && detail) return { main, detail };
    }

    return { main: original, detail: "" };
  }

  function productNameHtml(product) {
    const parts = splitProductName(product);
    return `<span class="product-name-main">${escapeHtml(parts.main)}</span>${parts.detail ? `<span class="product-name-detail">${escapeHtml(parts.detail)}</span>` : ""}`;
  }

  function productCodeHtml(product) {
    const code = String(product.code || "").trim();
    const hasNewBadge = Boolean(product.isNew) || /VN$/i.test(code);
    const hasNsxBadge = Boolean(product.isDiscontinued) && !hasNewBadge;
    const hasLegacyBadge = Boolean(product.isLegacyStock);
    const hasNewOrderBadge = Boolean(product.isNewOrder);
    const badgeItems = [
      hasNewBadge ? '<span class="product-code-badge product-code-badge--new">NEW</span>' : "",
      hasNsxBadge ? '<span class="product-code-badge product-code-badge--nsx">NSX</span>' : "",
      hasLegacyBadge ? '<span class="product-code-badge product-code-badge--legacy">TỒN</span>' : "",
      hasNewOrderBadge ? '<span class="product-code-badge product-code-badge--order">NEW ORDER</span>' : ""
    ].filter(Boolean);
    const badges = badgeItems.join("");

    let inlineCode = escapeHtml(code);
    if (hasLegacyBadge && /\/01$/i.test(code)) {
      const base = code.slice(0, -3);
      inlineCode = `${escapeHtml(base)}<span class="product-code-suffix product-code-suffix--legacy"><span class="product-code-badge product-code-badge--legacy">TỒN</span>/01</span>`;
    } else if (hasNewBadge && /VN$/i.test(code)) {
      const base = code.slice(0, -2);
      inlineCode = `${escapeHtml(base)}<span class="product-code-suffix"><span class="product-code-badge product-code-badge--new">NEW</span>VN</span>`;
    } else if (hasNewBadge) {
      inlineCode += '<span class="product-code-status"><span class="product-code-badge product-code-badge--new">NEW</span></span>';
    } else if (hasLegacyBadge) {
      inlineCode += '<span class="product-code-status"><span class="product-code-badge product-code-badge--legacy">TỒN</span></span>';
    }

    if (hasNsxBadge) {
      inlineCode += '<span class="product-code-status"><span class="product-code-badge product-code-badge--nsx">NSX</span></span>';
    }
    if (hasNewOrderBadge) {
      inlineCode += '<span class="product-code-status product-code-status--wide"><span class="product-code-badge product-code-badge--order">NEW ORDER</span></span>';
    }

    const hasStatus = badgeItems.length > 0;
    const forceBadgeStart = hasNewOrderBadge || badgeItems.length > 1;
    const statusClass = hasStatus ? " has-status" : "";
    const startClass = forceBadgeStart ? " is-badge-start" : "";
    return `<span class="product-code-label${statusClass}${startClass}" data-code-length="${code.length}" data-force-badge-start="${forceBadgeStart ? "1" : "0"}">
      ${badges ? `<span class="product-code-badge-row" aria-hidden="true">${badges}</span>` : ""}
      <span class="product-code-content">${inlineCode}</span>
    </span>`;
  }

  function updateCodeBadgeLayouts() {
    const labels = [...document.querySelectorAll(".product-code-label.has-status")];
    labels.forEach((label) => {
      label.classList.toggle("is-badge-start", label.dataset.forceBadgeStart === "1");
    });

    window.requestAnimationFrame(() => {
      labels.forEach((label) => {
        if (label.dataset.forceBadgeStart === "1") return;
        const button = label.closest(".product-code-btn");
        const content = label.querySelector(".product-code-content");
        if (!button || !content) return;

        const buttonRect = button.getBoundingClientRect();
        const badges = [...content.querySelectorAll(".product-code-badge")];
        const badgeOutside = badges.some((badge) => {
          const badgeRect = badge.getBoundingClientRect();
          return badgeRect.left < buttonRect.left + 1 || badgeRect.right > buttonRect.right - 1;
        });
        const codeLength = Number(label.dataset.codeLength || 0);
        const contentTooWide = content.scrollWidth > button.clientWidth + 1;

        if (codeLength >= 16 || contentTooWide || badgeOutside) {
          label.classList.add("is-badge-start");
        }
      });
    });
  }

  function productRow(product, visibleIndex) {
    const level = stockLevel(product.quantity);
    return `
      <tr>
        <td class="cell-stt">
          <label class="row-select-wrap">
            <input class="row-select-checkbox" type="checkbox" data-select-code="${escapeHtml(product.code)}" aria-label="Chọn mã ${escapeHtml(product.code)}" ${isSelected(product.code) ? "checked" : ""}>
            <span>${visibleIndex}</span>
          </label>
        </td>
        <td class="cell-group">${iconBadge(product.group)}</td>
        <td><span class="subgroup-chip">${escapeHtml(product.subgroup)}</span></td>
        <td>
          <button class="product-code-btn" type="button" data-product-code="${escapeHtml(product.code)}" aria-label="Xem nhanh ảnh ${escapeHtml(product.code)}">
            ${productCodeHtml(product)}
          </button>
        </td>
        <td>
          <button class="product-name-btn" type="button" data-product-code="${escapeHtml(product.code)}" aria-label="Xem nhanh thông số ${escapeHtml(product.name)}">
            ${productNameHtml(product)}
            <span class="name-hint">BẤM TÊN ĐỂ XEM THÔNG SỐ</span>
          </button>
        </td>
        <td class="price-cell">${formatMoney(product.listPrice)}</td>
        <td class="cell-quantity"><span class="quantity-badge quantity-badge--${level}">${numberFormatter.format(product.quantity)}</span></td>
      </tr>`;
  }

  function productMobileCard(product, visibleIndex) {
    const level = stockLevel(product.quantity);
    return `
      <article class="inventory-mobile-card inventory-mobile-card--${level}">
        <div class="mobile-card-top">
          <label class="mobile-card-select" aria-label="Chọn mã ${escapeHtml(product.code)}">
            <input class="mobile-select-checkbox" type="checkbox" data-select-code="${escapeHtml(product.code)}" ${isSelected(product.code) ? "checked" : ""} />
            <span class="mobile-card-index">STT <b>${visibleIndex}</b></span>
          </label>
          <span class="mobile-group-block">${iconBadge(product.group)}<span class="subgroup-chip">${escapeHtml(product.subgroup)}</span></span>
        </div>
        <button class="product-code-btn mobile-code-action" type="button" data-product-code="${escapeHtml(product.code)}" aria-label="Xem ảnh và tài liệu của mã ${escapeHtml(product.code)}">
          ${productCodeHtml(product)}
          <span class="mobile-touch-hint">CHẠM MÃ ĐỂ XEM ẢNH &amp; TÀI LIỆU</span>
        </button>
        <div class="mobile-card-name">
          <button class="product-name-btn" type="button" data-product-code="${escapeHtml(product.code)}" aria-label="Xem thông số kỹ thuật của ${escapeHtml(product.name)}">
            ${productNameHtml(product)}
            <span class="name-hint">CHẠM TÊN ĐỂ XEM THÔNG SỐ</span>
          </button>
        </div>
        <div class="mobile-card-footer">
          <div class="mobile-card-price-block">
            <span>GIÁ NIÊM YẾT</span>
            <strong class="mobile-card-price">${formatMoney(product.listPrice)}</strong>
          </div>
          <div class="mobile-card-stock-block">
            <span>SỐ LƯỢNG</span>
            <span class="quantity-badge quantity-badge--${level}">${numberFormatter.format(product.quantity)}</span>
          </div>
        </div>
      </article>`;
  }


  function isSelected(productCode) {
    return state.selectedCodes.has(String(productCode || "").trim());
  }

  function filteredProductCodes() {
    return filteredProducts().map((product) => String(product.code || "").trim()).filter(Boolean);
  }

  function selectedFilteredCodes() {
    const filteredSet = new Set(filteredProductCodes());
    return [...state.selectedCodes].filter((code) => filteredSet.has(code));
  }

  function syncVisibleSelection(code, checked) {
    document.querySelectorAll("[data-select-code]").forEach((input) => {
      if (String(input.dataset.selectCode || "") === code) input.checked = checked;
    });
  }

  function toggleSelectedCode(productCode, checked) {
    const code = String(productCode || "").trim();
    if (!code) return;
    if (checked) state.selectedCodes.add(code);
    else state.selectedCodes.delete(code);
    syncVisibleSelection(code, checked);
    updateSelectionSummary();
  }

  function updateSelectionSummary() {
    const totalFiltered = filteredProductCodes().length;
    const selectedCount = selectedFilteredCodes().length;
    const allChecked = totalFiltered > 0 && selectedCount === totalFiltered;

    if (els.selectedCount) els.selectedCount.textContent = numberFormatter.format(selectedCount);
    if (els.selectedCompact) els.selectedCompact.hidden = selectedCount === 0;
    if (els.clearSelection) els.clearSelection.hidden = selectedCount === 0;
    if (els.selectAllFilteredBtn) {
      els.selectAllFilteredBtn.disabled = totalFiltered === 0;
      els.selectAllFilteredBtn.classList.toggle("is-active", allChecked);
      els.selectAllFilteredBtn.textContent = allChecked ? "BỎ CHỌN TẤT CẢ" : "CHỌN TẤT CẢ";
    }
    window.dispatchEvent(new CustomEvent("inventory-selection-changed"));
  }

  function setSelectionForFiltered(checked) {
    filteredProductCodes().forEach((code) => {
      if (checked) state.selectedCodes.add(code);
      else state.selectedCodes.delete(code);
    });
    renderTable();
  }

  function pageSequence(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const valid = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const sequence = [];
    valid.forEach((page, index) => {
      if (index && page - valid[index - 1] > 1) sequence.push("…");
      sequence.push(page);
    });
    return sequence;
  }

  function renderPagination(totalItems) {
    const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    els.prevPage.disabled = state.page <= 1;
    els.nextPage.disabled = state.page >= totalPages;
    els.pagination.hidden = totalItems === 0;
    els.pageNumbers.innerHTML = pageSequence(state.page, totalPages).map((entry) => {
      if (entry === "…") return `<span class="page-ellipsis">…</span>`;
      return `<button class="page-number${entry === state.page ? " is-active" : ""}" type="button" data-page="${entry}">${entry}</button>`;
    }).join("");
  }

  function renderTable() {
    const products = filteredProducts();
    const totalPages = Math.max(1, Math.ceil(products.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * state.pageSize;
    const pageProducts = products.slice(start, start + state.pageSize);
    const activeGroupMeta = groupMeta(state.activeGroup);
    const subgroup = activeSubgroupInfo();

    els.resultTitle.textContent = subgroup
      ? `${groupMeta(subgroup.group).shortLabel} · ${subgroup.subgroup}`
      : (state.activeGroup === ALL_GROUPS ? "TẤT CẢ SẢN PHẨM" : activeGroupMeta.shortLabel);
    if (els.resultCount) {
      const end = Math.min(start + state.pageSize, products.length);
      els.resultCount.textContent = products.length
        ? `Hiển thị ${numberFormatter.format(start + 1)}–${numberFormatter.format(end)} trong ${numberFormatter.format(products.length)} mã phù hợp`
        : "Không có mã phù hợp";
    }

    els.tableBody.innerHTML = pageProducts.map((product, index) => productRow(product, start + index + 1)).join("");
    els.mobileList.innerHTML = pageProducts.map((product, index) => productMobileCard(product, start + index + 1)).join("");
    els.empty.hidden = products.length > 0;
    els.tableWrap.hidden = products.length === 0;
    els.mobileList.hidden = products.length === 0;

    renderPagination(products.length);
    bindProductClickEvents();
    updateCodeBadgeLayouts();
    updateSelectionSummary();
    window.dispatchEvent(new CustomEvent("inventory-filter-changed"));
  }

  function renderAll() {
    renderStats();
    renderGroups();
    renderSubgroups();
    renderTable();
  }

  function usesTouchOverlay() {
    return window.matchMedia("(max-width: 960px), (hover: none), (pointer: coarse)").matches;
  }

  function syncFloatingOverlayState() {
    const touchMode = usesTouchOverlay();
    const previewOpen = !els.preview.hidden;
    const specOpen = !els.specPreview.hidden;
    const overlayOpen = touchMode && (previewOpen || specOpen);

    els.preview.classList.toggle("is-mobile-sheet", touchMode && previewOpen);
    els.specPreview.classList.toggle("is-mobile-sheet", touchMode && specOpen);
    els.preview.setAttribute("aria-modal", String(touchMode && previewOpen));
    els.specPreview.setAttribute("aria-modal", String(touchMode && specOpen));
    els.floatingPreviewBackdrop.hidden = !overlayOpen;
    document.body.classList.toggle("is-product-overlay-open", overlayOpen);
  }

  function clearPreviewHide() { window.clearTimeout(state.previewTimer); }
  function clearSpecHide() { window.clearTimeout(state.specTimer); }
  function schedulePreviewHide(delay = 180) {
    clearPreviewHide();
    if (state.previewPinned) return;
    state.previewTimer = window.setTimeout(() => hidePreview(false), delay);
  }
  function scheduleSpecHide(delay = 180) {
    clearSpecHide();
    if (state.specPinned) return;
    state.specTimer = window.setTimeout(() => hideSpecPreview(false), delay);
  }

  function placeFloatingPanel(panel, trigger, preferredWidth = 360, preferredHeight = 360) {
    if (!panel || !trigger) return;
    const gap = 12;
    const rect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const width = panelRect.width || preferredWidth;
    const height = panelRect.height || preferredHeight;
    let left = rect.right + gap;
    if (left + width > window.innerWidth - gap) left = rect.left - width - gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - width - gap));
    let top = rect.top - 10;
    top = Math.max(gap, Math.min(top, window.innerHeight - height - gap));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function resetPreviewImage() {
    state.imageLoadToken += 1;
    window.clearTimeout(state.imageLoadTimer);
    state.imageLoadTimer = 0;
    els.previewImage.removeAttribute("src");
    els.previewImage.classList.remove("is-visible");
    els.previewPlaceholder.hidden = false;
    els.previewPlaceholder.querySelector("span").textContent = "CHƯA CÓ ẢNH";
    els.previewPlaceholder.querySelector("small").textContent = "Thêm đường dẫn trong inventory-images.js";
    els.previewLoader.hidden = true;
    els.previewImageButton.disabled = true;
    els.imageZoomHint.hidden = true;
  }

  function loadPreviewImage(product, url) {
    resetPreviewImage();
    if (!url) return;

    const token = state.imageLoadToken;
    let settled = false;
    els.previewPlaceholder.hidden = true;
    els.previewLoader.hidden = false;
    els.previewImage.alt = `Ảnh sản phẩm ${product.code}`;
    const loader = new Image();
    loader.decoding = "async";

    const finishError = (message = "Kiểm tra lại đường dẫn trong inventory-images.js") => {
      if (settled || token !== state.imageLoadToken) return;
      settled = true;
      window.clearTimeout(state.imageLoadTimer);
      state.imageLoadTimer = 0;
      els.previewLoader.hidden = true;
      els.previewPlaceholder.hidden = false;
      els.previewPlaceholder.querySelector("span").textContent = "ẢNH KHÔNG KHẢ DỤNG";
      els.previewPlaceholder.querySelector("small").textContent = message;
      els.previewImageButton.disabled = true;
      els.imageZoomHint.hidden = true;
    };

    loader.onload = () => {
      if (settled || token !== state.imageLoadToken) return;
      settled = true;
      window.clearTimeout(state.imageLoadTimer);
      state.imageLoadTimer = 0;
      els.previewImage.src = url;
      els.previewImage.classList.add("is-visible");
      els.previewLoader.hidden = true;
      els.previewImageButton.disabled = false;
      els.imageZoomHint.hidden = false;
      requestAnimationFrame(() => state.activePreview?.trigger && placeFloatingPanel(els.preview, state.activePreview.trigger, 360, 420));
    };
    loader.onerror = () => finishError();
    state.imageLoadTimer = window.setTimeout(
      () => finishError("Đường dẫn ảnh phản hồi quá chậm hoặc không truy cập được"),
      8000
    );
    loader.src = url;
  }

  function showPreview(product, trigger, pinned = false) {
    clearPreviewHide();
    if (!product || !trigger) return;
    if (state.previewPinned && !pinned) return;
    if (pinned || usesTouchOverlay()) hideSpecPreview(true);
    state.previewPinned = Boolean(pinned);
    const asset = assetFor(product.code);
    state.activePreview = { product, trigger, url: asset.image, technicalDrawing: asset.technicalDrawing };
    els.previewGroup.textContent = `${product.group} · ${product.subgroup}`;
    els.previewCode.textContent = product.code;
    els.previewName.textContent = product.name;
    const hasTechnicalDrawing = Boolean(asset.technicalDrawing);
    els.openTechnicalDrawing.hidden = !hasTechnicalDrawing;
    els.openTechnicalDrawing.disabled = !hasTechnicalDrawing;
    els.openTechnicalDrawing.title = hasTechnicalDrawing ? "Mở bản vẽ kỹ thuật" : "";
    els.previewActions.classList.toggle("is-single", !hasTechnicalDrawing);
    els.preview.hidden = false;
    syncFloatingOverlayState();
    loadPreviewImage(product, asset.image);
    if (!usesTouchOverlay()) {
      requestAnimationFrame(() => placeFloatingPanel(els.preview, trigger, 350, 500));
    }
  }

  function hidePreview(force = false) {
    clearPreviewHide();
    if (state.previewPinned && !force) return;
    if (!els.preview.hidden) {
      resetPreviewImage();
      els.preview.hidden = true;
    }
    state.activePreview = null;
    state.previewPinned = false;
    syncFloatingOverlayState();
  }

  function classifySpecLine(line) {
    const value = String(line || "").replace(/^·\s*/, "").trim();
    const lower = normalizeText(value);
    if (!value) return null;
    if (/\d+\s*[x×]\s*\d+/i.test(value)) return { kind: "KÍCH THƯỚC", icon: "size", text: value };
    if (/(flush|dual flush|volume|\bl\b|water efficiency|wash down|siphonic|siphoinc|jet)/i.test(lower)) return { kind: "XẢ NƯỚC", icon: "water", text: value };
    if (/(rough-in|p-trap|s-trap|ps-trap|transform|concealed|installation|fixing kit|wall-hung|floor standing)/i.test(lower)) return { kind: "LẮP ĐẶT", icon: "install", text: value };
    if (/(pressure|mpa|bar)/i.test(lower)) return { kind: "ÁP LỰC", icon: "pressure", text: value };
    if (/(voltage|power|w\b|ipx|hz)/i.test(lower)) return { kind: "ĐIỆN", icon: "electric", text: value };
    if (/(seat|cover|soft-close)/i.test(lower)) return { kind: "NẮP / GHẾ", icon: "seat", text: value };
    if (/(mechanism|cistern|cartridge|ceramics|cartriadge)/i.test(lower)) return { kind: "CƠ CẤU", icon: "gear", text: value };
    if (/(material|finish|brass|ss|stainless|zinc|abs|surface)/i.test(lower)) return { kind: "CHẤT LIỆU", icon: "material", text: value };
    return { kind: "GHI CHÚ", icon: "note", text: value };
  }

  function buildSpecHtml(product) {
    const lines = String(product.specifications || "")
      .split(/\n+/)
      .map((line) => classifySpecLine(line))
      .filter(Boolean);
    if (!lines.length) return '<div class="spec-empty">Chưa có thông số kỹ thuật chi tiết cho mã này.</div>';
    return lines.slice(0, 8).map((line) => `
      <div class="spec-item">
        <span class="spec-kind-icon">${iconSvg(line.icon)}</span>
        <div class="spec-body">
          <b>${escapeHtml(line.kind)}</b>
          <span>${escapeHtml(line.text)}</span>
        </div>
      </div>`).join("");
  }

  function showSpecPreview(product, trigger, pinned = false) {
    clearSpecHide();
    if (!product || !trigger) return;
    if (state.specPinned && !pinned) return;
    if (pinned || usesTouchOverlay()) hidePreview(true);
    state.specPinned = Boolean(pinned);
    state.activeSpec = { product, trigger };
    els.specGroup.textContent = `${product.group} · ${product.subgroup}`;
    els.specCode.textContent = product.code;
    els.specName.textContent = product.name;
    els.specPreviewGrid.innerHTML = buildSpecHtml(product);
    els.specPreview.hidden = false;
    syncFloatingOverlayState();
    if (!usesTouchOverlay()) {
      requestAnimationFrame(() => placeFloatingPanel(els.specPreview, trigger, 360, 440));
    }
  }

  function hideSpecPreview(force = false) {
    clearSpecHide();
    if (state.specPinned && !force) return;
    if (!els.specPreview.hidden) {
      els.specPreview.hidden = true;
      els.specPreviewGrid.innerHTML = "";
    }
    state.activeSpec = null;
    state.specPinned = false;
    syncFloatingOverlayState();
  }

  function bindProductClickEvents() {
    document.querySelectorAll(".product-code-btn").forEach((button) => {
      const product = productByCode(button.dataset.productCode);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showPreview(product, button, true);
      });
    });

    document.querySelectorAll(".product-name-btn").forEach((button) => {
      const product = productByCode(button.dataset.productCode);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showSpecPreview(product, button, true);
      });
    });
  }

  function openModal() {
    const active = state.activePreview;
    if (!active || !active.url || els.previewImageButton.disabled) return;
    els.modalProductGroup.textContent = `${active.product.group} · ${active.product.subgroup}`;
    els.modalProductCode.textContent = active.product.code;
    els.modalProductName.textContent = active.product.name;
    els.modalImage.src = active.url;
    els.modalImage.alt = `Ảnh sản phẩm ${active.product.code}`;
    els.openOriginalImage.href = active.url;
    els.modal.hidden = false;
    document.body.classList.add("is-modal-open");
    els.modalClose.focus();
  }

  function closeModal() {
    if (els.modal.hidden) return;
    els.modal.hidden = true;
    els.modalImage.removeAttribute("src");
    document.body.classList.remove("is-modal-open");
  }

  function openTechnicalDrawing() {
    const url = state.activePreview?.technicalDrawing;
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyCode() {
    const code = state.activePreview?.product.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const temp = document.createElement("textarea");
      temp.value = code;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    const original = els.copyPreviewCode.textContent;
    els.copyPreviewCode.textContent = "ĐÃ SAO CHÉP";
    window.setTimeout(() => { els.copyPreviewCode.textContent = original; }, 1200);
  }

  function setGroup(group) {
    state.activeGroup = group || ALL_GROUPS;
    state.activeSubgroup = ALL_SUBGROUPS;
    state.page = 1;
    renderGroups();
    renderSubgroups();
    renderTable();
    hidePreview();
    hideSpecPreview();
    closeDrawer();
  }

  async function loadJson(url, validator) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Không tải được ${url}`);
    const json = await response.json();
    if (validator && !validator(json)) throw new Error(`${url} không đúng cấu trúc`);
    return json;
  }

  function openDrawer() {
    els.groupDrawer.hidden = false;
    els.groupDrawerBackdrop.hidden = false;
    document.body.classList.add("is-drawer-open");
    els.groupDrawerToggle.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    document.body.classList.remove("is-drawer-open");
    els.groupDrawerToggle.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!document.body.classList.contains("is-drawer-open")) {
        els.groupDrawer.hidden = true;
        els.groupDrawerBackdrop.hidden = true;
      }
    }, 280);
  }

  function bindEvents() {
    els.groupDrawerToggle.addEventListener("click", () => {
      if (document.body.classList.contains("is-drawer-open")) closeDrawer();
      else openDrawer();
    });
    els.groupDrawerClose.addEventListener("click", closeDrawer);
    els.groupDrawerBackdrop.addEventListener("click", closeDrawer);

    els.groupList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-group]");
      if (button) setGroup(button.dataset.group);
    });
    els.mobileGroupSelect.addEventListener("change", (event) => setGroup(event.target.value));
    if (els.subgroupSelect) {
      els.subgroupSelect.addEventListener("change", (event) => {
        state.activeSubgroup = event.target.value || ALL_SUBGROUPS;
        state.page = 1;
        renderTable();
      });
    }
    els.search.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      state.page = 1;
      renderTable();
    });
    els.stockFilter.addEventListener("change", (event) => {
      state.stock = event.target.value;
      state.page = 1;
      renderTable();
    });
    els.sortSelect.addEventListener("change", (event) => {
      state.sort = event.target.value;
      state.page = 1;
      renderTable();
    });
    if (els.pageSizeSelect) {
      els.pageSizeSelect.value = String(state.pageSize);
      els.pageSizeSelect.addEventListener("change", (event) => {
        state.pageSize = Math.max(1, Number(event.target.value) || 10);
        state.page = 1;
        renderTable();
      });
    }
    els.resetFilters.addEventListener("click", () => {
      state.activeGroup = ALL_GROUPS;
      state.activeSubgroup = ALL_SUBGROUPS;
      state.search = "";
      state.stock = "all";
      state.sort = "recommended";
      state.page = 1;
      els.search.value = "";
      els.stockFilter.value = "all";
      els.sortSelect.value = "recommended";
      renderGroups();
      renderSubgroups();
      renderTable();
      hidePreview();
      hideSpecPreview();
    });
    els.prevPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
        document.getElementById("inventoryToolbar").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    els.nextPage.addEventListener("click", () => {
      const totalPages = Math.ceil(filteredProducts().length / state.pageSize);
      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
        document.getElementById("inventoryToolbar").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    els.pageNumbers.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.page = Number(button.dataset.page) || 1;
      renderTable();
      document.getElementById("inventoryToolbar").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (els.selectAllFilteredBtn) {
      els.selectAllFilteredBtn.addEventListener("click", () => {
        const filteredCodes = filteredProductCodes();
        const selectedCodes = selectedFilteredCodes();
        setSelectionForFiltered(!(filteredCodes.length > 0 && selectedCodes.length === filteredCodes.length));
      });
    }
    if (els.clearSelection) {
      els.clearSelection.addEventListener("click", () => {
        state.selectedCodes.clear();
        renderTable();
      });
    }
    const handleSelectionChange = (event) => {
      const input = event.target.closest("[data-select-code]");
      if (!input) return;
      toggleSelectedCode(input.dataset.selectCode, input.checked);
    };
    els.tableBody.addEventListener("change", handleSelectionChange);
    els.mobileList.addEventListener("change", handleSelectionChange);

    els.previewImageButton.addEventListener("click", openModal);
    els.openTechnicalDrawing.addEventListener("click", openTechnicalDrawing);
    els.copyPreviewCode.addEventListener("click", copyCode);
    els.imagePreviewClose.addEventListener("click", () => hidePreview(true));
    els.specPreviewClose.addEventListener("click", () => hideSpecPreview(true));
    els.floatingPreviewBackdrop.addEventListener("click", () => {
      hidePreview();
      hideSpecPreview();
    });
    els.modalBackdrop.addEventListener("click", closeModal);
    els.modalClose.addEventListener("click", closeModal);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        els.search.focus();
        els.search.select();
      }
      if (event.key === "Escape") {
        if (!els.modal.hidden) closeModal();
        else {
          hidePreview(true);
          hideSpecPreview(true);
          closeDrawer();
        }
      }
    });

    window.addEventListener("scroll", () => {
      els.backTop.classList.toggle("is-visible", window.scrollY > 420);
    }, { passive: true });
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      closeDrawer();
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        updateCodeBadgeLayouts();
        syncFloatingOverlayState();
        if (!usesTouchOverlay()) {
          if (!els.preview.hidden && state.activePreview?.trigger) placeFloatingPanel(els.preview, state.activePreview.trigger, 350, 500);
          if (!els.specPreview.hidden && state.activeSpec?.trigger) placeFloatingPanel(els.specPreview, state.activeSpec.trigger, 360, 440);
        }
      }, 80);
    });
    els.backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  async function loadSpecDirectoryIndex() {
    if (location.protocol === "file:") return {};
    try {
      const response = await fetch("spec/", { cache: "no-store" });
      if (!response.ok) return {};
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const files = [...doc.querySelectorAll("a[href]")]
        .map((anchor) => anchor.getAttribute("href") || "")
        .filter((href) => /\.(?:pdf|jpe?g|png|webp)$/i.test(href));
      return normalizeSpecManifest(files.map((href) => {
        try {
          return new URL(href, new URL("spec/", document.baseURI)).href;
        } catch {
          return `spec/${href.replace(/^\.?\//, "")}`;
        }
      }));
    } catch {
      return {};
    }
  }

  window.InventoryApp = {
    getFilteredProducts() {
      return filteredProducts().map((product) => {
        const asset = assetFor(product.code);
        return { ...product, image: asset.image || "", technicalDrawing: asset.technicalDrawing || "" };
      });
    },
    getSelectedProducts() {
      const codeSet = state.selectedCodes;
      return filteredProducts()
        .filter((product) => codeSet.has(String(product.code || "").trim()))
        .map((product) => {
          const asset = assetFor(product.code);
          return { ...product, image: asset.image || "", technicalDrawing: asset.technicalDrawing || "" };
        });
    },
    getExportProducts(mode = "filtered") {
      return mode === "selected" ? this.getSelectedProducts() : this.getFilteredProducts();
    },
    getSelectionState() {
      const filteredCodes = filteredProductCodes();
      const selectedCodes = selectedFilteredCodes();
      return {
        selectedCount: selectedCodes.length,
        filteredCount: filteredCodes.length,
        hasSelection: selectedCodes.length > 0,
        allFilteredSelected: filteredCodes.length > 0 && selectedCodes.length === filteredCodes.length
      };
    },
    getFilterContext() {
      const group = state.activeGroup === ALL_GROUPS ? "TẤT CẢ SẢN PHẨM" : groupMeta(state.activeGroup).shortLabel;
      const subgroupInfo = activeSubgroupInfo();
      const subgroup = subgroupInfo ? subgroupInfo.subgroup : "TẤT CẢ NHÓM CON";
      const subgroupGroup = subgroupInfo ? groupMeta(subgroupInfo.group).shortLabel : "";
      const scopeLabel = subgroupInfo ? `${subgroupGroup} · ${subgroup}` : group;
      return {
        group,
        groupCode: state.activeGroup,
        subgroup,
        subgroupKey: state.activeSubgroup,
        subgroupGroup,
        scopeLabel,
        search: state.search,
        stock: state.stock,
        sort: state.sort,
        count: filteredProducts().length
      };
    },
    getMeta() { return { ...(state.data.meta || {}) }; },
    formatMoney,
    refreshExportScope() { window.dispatchEvent(new CustomEvent("inventory-filter-changed")); }
  };

  async function boot() {
    bindEvents();
    renderAll();
    window.dispatchEvent(new CustomEvent("inventory-ready"));

    if (location.protocol !== "file:") {
      try {
        state.data = await loadJson("inventory-data.json", (json) => json && Array.isArray(json.products));
        state._productMap = null;
        renderAll();
      } catch (error) {
        console.warn("Không tải được inventory-data.json; đang dùng inventory-data.js.", error);
      }

      try {
        const images = await loadJson("inventory-images.json", (json) => json && typeof json === "object" && !Array.isArray(json));
        state.assetMap = mergeAssetMaps(state.assetMap, images);
      } catch (error) {
        console.warn("Không tải được inventory-images.json; đang dùng inventory-images.js.", error);
      }

      try {
        const assets = await loadJson("inventory-assets.json", (json) => json && typeof json === "object" && !Array.isArray(json));
        state.assetMap = mergeAssetMaps(state.assetMap, assets);
      } catch (error) {
        console.warn("Không tải được inventory-assets.json; đang dùng inventory-assets.js.", error);
      }

      try {
        const specManifest = await loadJson("spec-manifest.json", (json) => json && typeof json === "object");
        state.specMap = mergeSpecMaps(state.specMap, normalizeSpecManifest(specManifest));
      } catch (error) {
        console.warn("Không tải được spec-manifest.json; đang dùng spec-manifest.js.", error);
      }

      state.specMap = mergeSpecMaps(state.specMap, await loadSpecDirectoryIndex());
    }
  }

  boot();
})();
