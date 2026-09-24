(function () {
  const canvas = document.getElementById("particles");
  if (canvas) {
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let specks = [];
    let w = 0;
    let h = 0;
    let last = performance.now();
    let running = true;
    const sprite = document.createElement("canvas");
    sprite.width = 64;
    sprite.height = 64;
    const sg = sprite.getContext("2d");
    if (sg) {
      const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(232,246,239,1)");
      grad.addColorStop(0.12, "rgba(143,245,200,0.85)");
      grad.addColorStop(0.38, "rgba(143,245,200,0.18)");
      grad.addColorStop(1, "rgba(143,245,200,0)");
      sg.fillStyle = grad;
      sg.fillRect(0, 0, 64, 64);
    }

    function nCount() {
      if (w < 480) return 28;
      if (w < 900) return 44;
      return 64;
    }

    function spawnOne() {
      return {
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        vx: (Math.random() - 0.5) * 0.00018,
        vy: (Math.random() - 0.5) * 0.00014,
        vz: (Math.random() - 0.5) * 0.0007,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.016,
      };
    }

    function fitCount() {
      const n = reduce ? 12 : nCount();
      while (specks.length < n) specks.push(spawnOne());
      if (specks.length > n) specks.length = n;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fitCount();
    }

    function draw(now) {
      if (!running) return;
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      mouse.x += (mouse.tx - mouse.x) * 0.06 * dt;
      mouse.y += (mouse.ty - mouse.y) * 0.06 * dt;
      ctx.clearRect(0, 0, w, h);
      for (const p of specks) {
        if (!reduce) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.pulse += p.pulseSpeed * dt;
        }
        if (p.x < -0.04) p.x = 1.04;
        else if (p.x > 1.04) p.x = -0.04;
        if (p.y < -0.04) p.y = 1.04;
        else if (p.y > 1.04) p.y = -0.04;
        if (p.z < 0.08) p.z = 0.96;
        else if (p.z > 0.98) p.z = 0.08;
        const depth = 1 - p.z;
        const px = p.x * w + (mouse.x - 0.5) * 48 * depth;
        const py = p.y * h + (mouse.y - 0.5) * 28 * depth;
        const size = 5 + depth * 18;
        ctx.globalAlpha = 0.22 + depth * 0.55 + Math.sin(p.pulse) * 0.08 * depth;
        ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    resize();
    requestAnimationFrame(draw);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener(
      "pointermove",
      (e) => {
        mouse.tx = e.clientX / window.innerWidth;
        mouse.ty = e.clientY / window.innerHeight;
      },
      { passive: true },
    );
    document.addEventListener("visibilitychange", () => {
      running = document.visibilityState === "visible";
      if (running) {
        last = performance.now();
        requestAnimationFrame(draw);
      }
    });
  }

  const clock = document.getElementById("clock");
  if (clock) {
    const tick = () => {
      clock.textContent = new Date().toISOString().slice(11, 19) + " UTC";
    };
    tick();
    setInterval(tick, 1000);
  }

  const form = document.getElementById("verify-form");
  if (!form) return;

  const midEl = document.getElementById("mid");
  const oidEl = document.getElementById("oid");
  const out = document.getElementById("readout");
  const log = document.getElementById("scan-log");
  const err = document.getElementById("err");
  const btn = document.getElementById("go");
  const historyEl = document.getElementById("history");
  const envEl = document.getElementById("env");
  const apiEl = document.getElementById("apiurl");
  const origin = location.origin + "/";
  if (envEl) envEl.textContent = "PAYMENT_API_URL=" + origin;
  if (apiEl) apiEl.textContent = origin + "api?mid=YOUR_MID&oid=ORDER_ID";

  const SCAN = [
    "> handshake securegw.paytm.in",
    "> POST merchant-status",
    "> POST order/status",
    "> retry on 334 / pending",
    "> wait TXN_SUCCESS",
  ];

  function tone(status) {
    if (status === "TXN_SUCCESS") return "ok";
    if (status === "PENDING") return "warn";
    return "bad";
  }

  function renderResult(data) {
    const card = document.getElementById("result-card");
    card.classList.toggle("ok", data.STATUS === "TXN_SUCCESS");
    card.classList.remove("hot");
    const rows = [
      ["STATUS", data.STATUS],
      ["ORDERID", data.ORDERID],
      ["TXNAMOUNT", data.TXNAMOUNT],
      ["TXNID", data.TXNID],
      ["BANKTXNID", data.BANKTXNID],
      ["TXNDATE", data.TXNDATE],
      ["PAYMENTMODE", data.PAYMENTMODE],
      ["RESPCODE", data.RESPCODE],
      ["RESPMSG", data.RESPMSG],
    ]
      .map(([k, v]) => "<div class='row'><dt>" + k + "</dt><dd>" + (v || "—") + "</dd></div>")
      .join("");
    out.innerHTML =
      "<div class='inner'>" +
      "<span class='badge " +
      tone(data.STATUS) +
      "'>" +
      (data.STATUS || "UNKNOWN") +
      "</span>" +
      "<div class='fields'>" +
      "<div><small>Amount</small><div>" +
      (data.TXNAMOUNT ? "₹" + data.TXNAMOUNT : "—") +
      "</div></div>" +
      "<div><small>Mode</small><div>" +
      (data.PAYMENTMODE || "—") +
      "</div></div>" +
      "<div><small>Order</small><div>" +
      (data.ORDERID || "—") +
      "</div></div>" +
      "<div><small>Date</small><div>" +
      (data.TXNDATE || "—") +
      "</div></div>" +
      "</div><dl class='rows'>" +
      rows +
      "</dl></div>";
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem("tdb.lookups.v1") || "[]");
    } catch {
      return [];
    }
  }

  function saveHistory(row) {
    const next = [row, ...loadHistory().filter((r) => r.oid !== row.oid)].slice(0, 12);
    localStorage.setItem("tdb.lookups.v1", JSON.stringify(next));
    paintHistory(next);
  }

  function paintHistory(rows) {
    if (!historyEl) return;
    if (!rows.length) {
      historyEl.innerHTML = "<p class='muted'>Verified orders stay on this device only.</p>";
      return;
    }
    historyEl.innerHTML =
      "<ul class='history'>" +
      rows
        .map(
          (r) =>
            "<li><span class='badge " +
            tone(r.status) +
            "'>" +
            r.status +
            "</span><button type='button' data-mid='" +
            r.mid +
            "' data-oid='" +
            r.oid +
            "'>" +
            r.oid +
            "</button><span class='muted'>" +
            (r.amount ? "₹" + r.amount : "") +
            "</span></li>",
        )
        .join("") +
      "</ul>";
  }

  paintHistory(loadHistory());
  historyEl?.addEventListener("click", (e) => {
    const t = e.target.closest("button[data-oid]");
    if (!t) return;
    midEl.value = t.dataset.mid;
    oidEl.value = t.dataset.oid;
    void run(t.dataset.mid, t.dataset.oid);
  });

  async function run(mid, oid) {
    err.textContent = "";
    btn.disabled = true;
    btn.classList.add("shimmer");
    document.getElementById("query-card").classList.add("hot");
    document.getElementById("result-card").classList.add("hot");
    let step = 0;
    const scan = setInterval(() => {
      log.textContent = SCAN[step % SCAN.length];
      step += 1;
    }, 520);
    try {
      let last = null;
      for (let i = 0; i < 3; i += 1) {
        const res = await fetch("/api/verify?mid=" + encodeURIComponent(mid) + "&oid=" + encodeURIComponent(oid));
        const data = await res.json();
        last = data;
        if (data.STATUS === "TXN_SUCCESS") break;
        const retry = data.STATUS === "PENDING" || data.RESPCODE === "334" || data.RESPCODE === "335" || data.RESPCODE === "400";
        if (retry && i < 2) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        else break;
      }
      renderResult(last);
      saveHistory({
        mid,
        oid: last.ORDERID || oid,
        status: last.STATUS || "UNKNOWN",
        amount: last.TXNAMOUNT || "",
      });
    } catch {
      err.textContent = "Still waiting on Paytm. Check again.";
    } finally {
      clearInterval(scan);
      log.textContent = "";
      btn.disabled = false;
      btn.classList.remove("shimmer");
      document.getElementById("query-card").classList.remove("hot");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const mid = midEl.value.trim();
    const oid = oidEl.value.trim();
    if (!mid || !oid) {
      err.textContent = "MID and Order ID are required.";
      return;
    }
    void run(mid, oid);
  });

  document.querySelectorAll("[data-copy]").forEach((el) => {
    el.addEventListener("click", async () => {
      const node = document.getElementById(el.dataset.copy);
      if (!node) return;
      try {
        await navigator.clipboard.writeText(node.textContent || "");
        el.textContent = "Copied";
        setTimeout(() => {
          el.textContent = "Copy";
        }, 1200);
      } catch {
        /* ignore */
      }
    });
  });
})();
