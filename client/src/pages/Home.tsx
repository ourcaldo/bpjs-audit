import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileText,
  History,
  KeyRound,
  LockKeyhole,
  Search,
  Send,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE ?? "";
const PAGE_SIZE = 15;
const CLAIMS_PAGE_SIZE = 15;

type Faskes = {
  group_label?: string | null;
  peringkat: number;
  kode: string;
  skor_gabungan: number;
  skor_gabungan_rf?: number | null;
  skor_los: number | null;
  skor_upcoding: number | null;
  klaim_ri: number;
  klaim_rj: number;
  estimasi_rugi: number;
};

type Verdict = {
  id: number;
  kode: string;
  period: string;
  verdict: string;
  auditor_notes: string | null;
  sample_kind: string;
  decided_at: string;
};

type Claim = {
  claim_id: string;
  cbg: string | null;
  umur: number | null;
  los: number | null;
  peer_median: number | null;
  excess: number | null;
  outlier: number | null;
  dx_change: number | null;
  n_dx: number | null;
  amt_ratio: number | null;
  setting: string | null;
};

type Stats = { faskes: number; beri_ri: number; rugi: number; klaim_ri: number; klaim_rj: number };

const fetchJson = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};

const postJson = async <T,>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};

const fmtDecimal = (value: number | null, digits = 3) =>
  value === null || value === undefined ? "—" : value.toFixed(digits).replace(".", ",");
const fmtNumber = (value: number | null) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("id-ID").format(value);
const fmtRupiah = (value: number | null) => {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;
};
const risk = (score: number) => score >= 0.7 ? { label: "TINGGI", className: "risk-high" } : score >= 0.4 ? { label: "MENENGAH", className: "risk-medium" } : { label: "RENDAH", className: "risk-low" };

function LogoMark({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "logo-mark logo-mark-compact" : "logo-mark"} aria-label="BPJS Kesehatan">BPJS</div>;
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  return (
    <main className="login-shell">
      <section className="login-side" aria-label="Informasi produk">
        <div className="login-side-top"><LogoMark /><span className="side-kicker">Portal Internal</span></div>
        <div className="login-copy">
          <p className="eyebrow light">AUDIT INTELLIGENCE</p>
          <h1>Prioritaskan audit<br /><span>dengan bukti.</span></h1>
          <p className="login-lede">Satu ruang kerja untuk membaca sinyal anomali klaim, memeringkat faskes, dan menyiapkan pemeriksaan yang lebih terarah.</p>
          <div className="side-rule" />
          <div className="login-meta"><ShieldCheck size={18} strokeWidth={1.7} /><span>Lingkungan internal BPJS Kesehatan</span></div>
          <div className="login-meta"><LockKeyhole size={18} strokeWidth={1.7} /><span>Akses terbatas untuk auditor terotorisasi</span></div>
        </div>
        <div className="login-footer">© 2026 BPJS Kesehatan · Klarity</div>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="mobile-brand"><LogoMark compact /><span>BPJS Kesehatan</span></div>
          <div className="form-heading">
            <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
            <h2>Masuk ke portal audit</h2>
            <p>Gunakan kredensial internal Anda untuk melanjutkan.</p>
          </div>
          <form className="login-form" onSubmit={(event) => { event.preventDefault(); onLogin(); }}>
            <label htmlFor="email">Email atau ID pegawai</label>
            <div className="input-wrap"><UserRound size={18} /><input id="email" type="text" defaultValue="auditor.pusat@bpjs-kesehatan.go.id" autoComplete="username" /></div>
            <label htmlFor="password">Kata sandi</label>
            <div className="input-wrap"><KeyRound size={18} /><input id="password" type={showPassword ? "text" : "password"} defaultValue="audit-demo-2026" autoComplete="current-password" /><button className="icon-button" type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} onClick={() => setShowPassword(!showPassword)}><Eye size={18} /></button></div>
            <div className="form-row"><label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span>Ingat perangkat ini</span></label><button type="button" className="text-button">Lupa kata sandi?</button></div>
            <button className="primary-button login-submit" type="submit">Masuk ke dashboard <ArrowRight size={17} /></button>
          </form>
          <div className="login-notice"><LockKeyhole size={16} /><span>Aktivitas Anda tercatat untuk kebutuhan keamanan dan audit internal.</span></div>
          <p className="demo-note">Mode demo aktif · data yang ditampilkan bersifat sintetis</p>
        </div>
      </section>
    </main>
  );
}

function Header({ onLogout }: { onLogout: () => void }) {
  return <header className="app-header"><div className="header-brand"><LogoMark /><div><h1>Klarity <span>— Peringkat Risiko Faskes</span></h1><p>Prototipe mesin skoring risiko faskes · data demo sintetis JKN / INA-CBG · skor merupakan prioritas audit, bukan vonis fraud</p></div></div><div className="header-actions"><span className="mode-chip">Prototipe</span><button className="profile-button" type="button" aria-label="Profil auditor"><span className="profile-avatar">AP</span><span className="profile-label">A. Prasetyo</span><ChevronRight size={15} /></button><button className="logout-button" type="button" aria-label="Keluar" onClick={onLogout}>Keluar</button></div></header>;
}

function StatBlocks({ items, id }: { items: { label: string; value: string; accent?: boolean }[]; id?: string }) {
  return <div className="stat-grid" id={id}>{items.map((item) => <div className={`stat-block ${item.accent ? "stat-accent" : ""}`} key={item.label}><span className="stat-label">{item.label}</span><strong>{item.value}</strong></div>)}</div>;
}

function ControlStrip({ threshold, setThreshold, query, setQuery, onlyEv, setOnlyEv }: { threshold: number; setThreshold: (value: number) => void; query: string; setQuery: (value: string) => void; onlyEv: boolean; setOnlyEv: (value: boolean) => void }) {
  return <div className="control-strip"><div className="control-group threshold-group"><label htmlFor="thr">Ambang skor minimum</label><input id="thr" type="range" min="0" max="100" step="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><output id="thrLab">{fmtDecimal(threshold / 100, 2)}</output></div><div className="control-group search-group"><label htmlFor="q">Cari kode faskes</label><div className="search-input"><Search size={17} /><input id="q" placeholder="Ketik kode…" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div><label className="check-label filter-check"><input id="onlyEv" type="checkbox" checked={onlyEv} onChange={(event) => setOnlyEv(event.target.checked)} /><span>Hanya faskes dengan klaim rawat inap</span></label></div>;
}

function RiskBadge({ score, id }: { score: number; id?: string }) { const r = risk(score); return <span id={id} className={`risk-badge ${r.className}`}>{r.label}</span>; }

function PriorityTable({ list, page, goPage, openDetail }: { list: Faskes[]; page: number; goPage: (page: number) => void; openDetail: (kode: string) => void }) {
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  return <section className="panel priority-panel"><div className="panel-heading"><div><h2>Daftar Prioritas Audit</h2><p>Klik baris faskes untuk membuka bukti audit.</p></div><div className="panel-stat"><BarChart3 size={18} /><span><strong>{list.length}</strong> faskes terpantau</span></div></div><div className="tbl-wrap"><table aria-label="Daftar prioritas audit faskes"><thead><tr><th>Peringkat</th><th>Faskes</th><th>Risiko</th><th>Skor Gabungan</th><th>Skor LOS</th><th>Skor Upcoding</th><th>Klaim RI</th><th>Klaim RJ</th><th>Estimasi Kerugian</th></tr></thead><tbody id="tbody">{pageItems.map((item) => <tr key={item.kode} tabIndex={0} role="button" onClick={() => openDetail(item.kode)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(item.kode); } }}><td className="rank-cell">{fmtNumber(item.peringkat)}</td><td className="facility-code">{item.kode}</td><td><RiskBadge score={item.skor_gabungan} /></td><td><div className="score-cell"><span className="score-track"><span style={{ width: `${item.skor_gabungan * 100}%` }} /></span><b>{fmtDecimal(item.skor_gabungan)}</b></div></td><td className="num-cell">{fmtDecimal(item.skor_los)}</td><td className="num-cell">{fmtDecimal(item.skor_upcoding)}</td><td className="num-cell">{fmtNumber(item.klaim_ri)}</td><td className="num-cell">{fmtNumber(item.klaim_rj)}</td><td className="num-cell money-cell">{fmtRupiah(item.estimasi_rugi)}</td></tr>)}</tbody></table>{pageItems.length === 0 && <div id="emptyNote" className="empty-note">Tidak ada faskes yang memenuhi kriteria. Turunkan ambang skor atau kosongkan pencarian.</div>}</div><div className="pager" id="pager"><span>Menampilkan {list.length ? start + 1 : 0}–{Math.min(start + PAGE_SIZE, list.length)} dari {list.length || 0} faskes</span><div className="pager-controls"><button className="ghost-button" disabled={page === 1} aria-label="Ke halaman awal" onClick={() => goPage(1)}>« Awal</button><button className="ghost-button" disabled={page === 1} aria-label="Ke halaman sebelumnya" onClick={() => goPage(page - 1)}>‹ Sebelumnya</button><span className="pager-status">Halaman {page} dari {totalPages}</span><button className="ghost-button" disabled={page === totalPages} aria-label="Ke halaman berikutnya" onClick={() => goPage(page + 1)}>Berikutnya ›</button><button className="ghost-button" disabled={page === totalPages} aria-label="Ke halaman terakhir" onClick={() => goPage(totalPages)}>Akhir »</button></div></div></section>;
}

function AboutPanel() {
  return <section className="panel about-panel"><div className="section-kicker"><SlidersHorizontal size={17} /><span>TENTANG SISTEM SKORING</span></div><ol className="about-list">
    <li><b>Skor Gabungan (composite)</b> adalah rata-rata skor modul LOS dan upcoding, dihitung dari persentil sinyal pada skala 0–1, dan menjadi dasar peringkat prioritas audit. Rumusnya transparan: setiap angka dapat ditelusuri hingga klaim asal dan dihitung ulang manual — inilah jangkar auditabilitas sistem.</li>
    <li><b>Skor LOS (Prolonged Length of Stay)</b> mengukur kecenderungan perpanjangan hari rawat inap di luar kebutuhan medis, dihitung dari proporsi klaim yang melampaui P90 kelompok pembanding (peer) dan rata-rata kelebihan hari rawat.</li>
    <li><b>Skor Upcoding</b> mengukur indikasi peningkatan beratnya klaim, dihitung dari tiga sinyal: diagnosis masuk yang hilang dari diagnosis akhir (DxChanged), jumlah kode diagnosis yang diklaim (NDx), dan rasio nilai klaim terhadap nilai klaim sejenis (AmtRatio).</li>
    <li><b>Skor RF (skor_gabungan_rf)</b> adalah skor kedua yang dihasilkan model Random Forest — ratusan pohon keputusan yang dilatih dari data berlabel dan memberi suara (voting) untuk setiap faskes. Saat ini base model dilatih dari data sintetis berlabel; model akan dilatih ulang dari vonis auditor nyata begitu jumlahnya cukup (±100 vonis). Skor RF berjalan di samping composite, bukan menggantikannya.</li>
    <li><b>Divergensi dua skor</b> adalah alarm peninjauan: bila RF dan composite berbeda jauh untuk satu faskes, sistem menandainya untuk diperiksa manusia. Composite tetap menjadi dasar peringkat; RF adalah pembanding yang terus belajar.</li>
    <li><b>Vonis auditor (audit_outcome)</b> adalah hasil pemeriksaan nyata oleh tim audit, dicatat apa adanya dalam lima kategori: konfirmasi fraud, sebagian terkonfirmasi, bersih, masalah administratif, atau perlu tindak lanjut. Setiap vonis menjadi data latih baru — semakin banyak auditor bekerja, semakin tajam prioritas berikutnya.</li>
    <li><b>Sampel kontrol acak</b>: setiap daftar prioritas menyertakan faskes acak dari populasi penuh yang diperiksa sama seriusnya. Tanpa ini, model hanya belajar dari pilihan sistemnya sendiri; sampel acak menghasilkan contoh jujur dari faskes yang bersih.</li>
    <li>Setiap klaim dibandingkan dengan kelompok pembanding: kode INA-CBG, rentang umur, tingkat komorbiditas, region, kelas RS, dan jenis tindakan (operatif / intervensi / tanpa prosedur) yang serupa — sehingga RS tersier yang memang merawat kasus berat tidak salah terbaca sebagai anomali.</li>
    <li>Nilai "wajar" (median) dan ambang anomali (P90) diturunkan dari statistik seluruh klaim dalam kelompok pembanding tersebut — bukan dari patokan luar. Kelompok dengan data terbatas menggunakan fallback hierarkis ke kelompok yang lebih luas.</li>
    <li>Sinyal LOS hanya berlaku untuk klaim rawat inap; klaim rawat jalan dinilai melalui sinyal diagnosis dan nilai klaim.</li>
    <li>Skor merupakan alat memprioritaskan audit — bukan vonis. Penetapan status fraud tetap melalui pemeriksaan oleh auditor, dan vonis itulah yang mengajari sistem.</li>
    <li>Ambang skor disesuaikan dengan kapasitas audit: ambang lebih rendah menangkap lebih banyak kasus (recall naik), ambang lebih tinggi mengurangi pemeriksaan yang tidak perlu (presisi naik).</li>
    <li>Mode <b>Data Sintetis</b> (default) menampilkan 37 juta klaim sintetis skala nasional berformat JKN sesuai Permenkes Nomor 26 Tahun 2021 — dipakai untuk mendemonstrasikan seluruh alur kerja audit per faskes.</li>
    <li>Mode <b>Data BPJS</b> menampilkan <b>Data Sampel Reguler Edisi 2025</b> — data klaim asli yang dipublikasikan resmi oleh BPJS Kesehatan: 1,7 juta klaim FKRTL tahun 2024 (195.544 rawat inap + 1,5 juta rawat jalan) dari 2.057 kelompok faskes di 38 provinsi.</li>
    <li>Proses data BPJS: file resmi (.dta) dikonversi oleh skrip <code>adapt_bpjs_sample.py</code> tanpa mengubah satu baris logika skoring — bukti klaim integrasi "data Anda, kontrak kami". Engine yang sama memproses keduanya.</li>
    <li>Privasi data BPJS: ID rumah sakit sengaja dihapus (masking) oleh BPJS dalam sampel publikasi — karena itu mode ini menampilkan <b>kelompok faskes</b> (kabupaten × kelas × kepemilikan), bukan rumah sakit per satuan. Tidak ada data peserta yang dapat diidentifikasi; angka tampilan adalah sample-observed tanpa bobot sampel (PSTV15), bukan estimasi nasional.</li>
    <li>Pengujian pada data BPJS menghasilkan perbaikan nyata: dimensi jenis tindakan (operatif/intervensi) ditambahkan ke pembanding biaya setelah ditemukan campuran operasi-konsultasi yang menghasilkan rasio semu.</li>
    <li>Sistem tidak memerlukan perubahan apa pun untuk memproses data produksi BPJS yang memuat kode PPK — tinggal diberi akses.</li>
  </ol><div className="about-divider" /><p className="about-footer">Klarity merupakan prototipe yang dibangun untuk keperluan kompetisi. Mode Data Sintetis memakai data buatan skala nasional 2025; mode Data BPJS memakai sampel publikasi resmi BPJS yang telah dianonimkan. Keduanya tidak merepresentasikan vonis atas fasilitas kesehatan mana pun.</p></section>;
}

// ---- Panel chat asisten (right panel, selalu render + handle geser) ----
// Struktur siap untuk Track B: chat grounding pada konteks faskes terpilih.
// Renderer markdown mini untuk jawaban agent (bold, list, heading, tabel) -
// tanpa dependency, cukup untuk format jawaban Klarity Agent.
function renderMarkdown(text: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bold = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = text.split("\n");
  const out: string[] = [];
  let inList = false, inTable = false;
  const endList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  const endTable = () => { if (inTable) { out.push("</tbody></table></div>"); inTable = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\|.*\|$/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
      if (!inTable) { endList(); out.push("<div class=\"md-table-wrap\"><table class=\"md-table\"><tbody>"); inTable = true; }
      out.push(`<tr>${cells.map((c) => `<td>${bold(c)}</td>`).join("")}</tr>`);
      continue;
    }
    endTable();
    if (/^#{1,3}\s/.test(line)) { endList(); out.push(`<h6 class="md-h">${bold(line.replace(/^#+\s/, ""))}</h6>`); continue; }
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      if (!inList) { out.push("<ul class=\"md-list\">"); inList = true; }
      out.push(`<li>${bold(line.replace(/^([-*]|\d+\.)\s/, ""))}</li>`); continue;
    }
    endList();
    if (!line) { out.push("<div class=\"md-gap\"></div>"); continue; }
    out.push(`<p class="md-p">${bold(line)}</p>`);
  }
  endList(); endTable();
  return out.join("");
}


// resizer drag: tarik tepi kiri panel untuk ubah lebar (min 400, max 800 = 2x min)
const PANEL_MIN_W = 400;
const PANEL_MAX_W = 800;
function PanelResizer({ width, setWidth }: { width: number; setWidth: (w: number) => void }) {
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      setWidth(Math.round(Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, startW + (startX - ev.clientX)))));
    };
    const up = () => {
      el.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    el.classList.add("dragging");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return <div className="panel-resizer" onPointerDown={start} title="Tarik untuk ubah lebar" />;
}

function ChatPanel({ facility, open, onClose, width, setWidth }: { facility: Faskes; open: boolean; onClose: () => void; width: number; setWidth: (w: number) => void }) {
  const [messages, setMessages] = useState<{ role: "ai" | "user"; text: string; tools?: { name: string }[] }[]>([
    { role: "ai", text: `Halo! Saya bisa membantu membaca bukti audit ${facility.kode}: menjelaskan skor, merangkum pola anomali, atau menilai konsistensi koding klaim. Saya mengambil data langsung dari database.` },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // riwayat chat tersimpan di DB (audit trail) - muat saat buka faskes
  useEffect(() => {
    fetchJson<{ items: { role: "user" | "assistant"; text: string; tool_calls: { name: string }[] | null }[] }>(
      `/api/agent/chat/${facility.kode}`)
      .then((r) => {
        if (r.items.length > 0)
          setMessages(r.items.map((it) => ({
            role: it.role === "user" ? "user" as const : "ai" as const,
            text: it.text,
            tools: it.tool_calls ?? undefined,
          })));
      }).catch(() => { });
  }, [facility.kode]);
  const chips = ["Kenapa risikonya tinggi?", "Ringkas outlier LOS", "Ada klaim dengan koding mencurigakan?"];
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    postJson<{ reply?: string; tool_calls?: { name: string }[]; detail?: string }>("/api/agent/chat", {
      text, kode: facility.kode, history,
    })
      .then((r) => setMessages((m) => [...m, {
        role: "ai",
        text: r.reply ?? r.detail ?? "Terjadi kesalahan.",
        tools: r.tool_calls,
      }]))
      .catch(() => setMessages((m) => [...m, { role: "ai", text: "Gagal menghubungi asisten. Coba lagi." }]))
      .finally(() => setBusy(false));
  };
  return (
    <aside className={`chat-panel ${open ? "chat-open" : ""}`} aria-label="Klarity Agent" style={{ "--panel-w": `${width}px` } as React.CSSProperties}>
      {open && <PanelResizer width={width} setWidth={setWidth} />}
      <div className="chat-head">
        <div className="chat-bot-mark">K</div>
        <div><h4>Klarity Agent</h4><small>Analisis klaim · konteks: {facility.kode}</small></div>
        {open && <button className="chat-close" type="button" aria-label="Tutup asisten" onClick={onClose}><X size={18} /></button>}
      </div>
      {open && <>
        <div className="chat-ctx">Konteks: <b>{facility.kode}</b> · Risiko {risk(facility.skor_gabungan).label} · {fmtNumber(facility.klaim_ri + facility.klaim_rj)} klaim</div>
        <div className="chat-msgs">{messages.map((m, i) => m.role === "ai"
          ? <div className="chat-m chat-m-ai" key={i}>
              <span className="chat-name">Klarity Agent</span>
              <div className="chat-bubble-ai" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
              {m.tools && m.tools.length > 0 && <span className="chat-tools">⌘ {m.tools.map((t) => t.name).join(", ")}</span>}
            </div>
          : <div className="chat-m chat-m-user" key={i}>{m.text}</div>)}
          {busy && <div className="chat-m chat-m-ai"><span className="chat-name">Klarity Agent</span><div className="chat-bubble-ai"><span className="typing-dots"><span /><span /><span /></span></div></div>}
        </div>
        <div className="chat-chips">{chips.map((c) => <button className="chat-chip" type="button" key={c} disabled={busy} onClick={() => send(c)}>{c}</button>)}</div>
        <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea rows={1} placeholder="Tanya tentang klaim ini…" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          <button className="chat-send" type="submit" aria-label="Kirim" disabled={busy}><Send size={16} /></button>
        </form>
      </>}
    </aside>
  );
}

// ---- Panel riwayat pemeriksaan (right panel kedua, aksen beda) ----
const VERDICT_OPTIONS = [
  { value: "confirmed", label: "Konfirmasi fraud" },
  { value: "partially", label: "Sebagian terkonfirmasi" },
  { value: "clean", label: "Bersih" },
  { value: "administrative", label: "Masalah administratif" },
  { value: "needs_followup", label: "Perlu tindak lanjut" },
];
const FINDING_OPTIONS = [
  { value: "fraud", label: "Fraud" },
  { value: "administrative", label: "Salah administrasi" },
  { value: "clean", label: "Bersih" },
  { value: "needs_review", label: "Perlu ditinjau" },
];

type Progress = { total: number; flagged: number; fraud: number; admin: number; clean: number; review: number; last_verdict: string | null; verdict_stale: boolean };
type HistoryData = { flags: { claim_id: string; finding: string; notes: string | null; audited_by: string | null; at: string }[]; verdicts: (Verdict & { audited_by: string | null })[] };
const AUDITOR_NAME = "A. Prasetyo";
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function HistoryPanel({ facility, open, onClose, refreshKey, progress, onSaved, width, setWidth }: { facility: Faskes; open: boolean; onClose: () => void; refreshKey: number; progress: Progress | null; onSaved: () => void; width: number; setWidth: (w: number) => void }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) fetchJson<HistoryData>(`/api/faskes/${facility.kode}/history`).then(setData).catch(() => setData(null));
  }, [facility.kode, open, refreshKey]);
  // ubah/isi vonis dari panel riwayat - bukan dari floating bar
  const canChange = progress && progress.flagged > 0;
  const stale = progress?.verdict_stale ?? false;
  useEffect(() => { if (progress) setSelected(suggestVerdict(progress)); }, [refreshKey, open]);
  const save = () => {
    if (!selected) return;
    setSaving(true);
    postJson<Verdict>("/api/verdicts", { kode: facility.kode, verdict: selected, audited_by: AUDITOR_NAME })
      .then(() => { setSelected(""); onSaved(); })
      .catch(() => setSaving(false))
      .finally(() => setSaving(false));
  };
  return (
    <>
    <aside className={`history-panel ${open ? "panel-open" : ""}`} aria-label="Riwayat pemeriksaan" style={{ "--panel-w": `${width}px` } as React.CSSProperties}>
      {open && <PanelResizer width={width} setWidth={setWidth} />}
      <div className="history-head"><History size={16} /><div><h4>Riwayat Pemeriksaan Faskes</h4><small>{facility.kode}</small></div>
        {open && <button className="chat-close" type="button" aria-label="Tutup riwayat" onClick={onClose}><X size={18} /></button>}</div>
      {open && (data ? <div className="history-body">
        {canChange && <div className="verdict-edit">
          <h5>{progress?.last_verdict ? (stale ? "Perubahan klaim setelah keputusan terakhir — perbarui status faskes" : "Ubah Status Faskes") : "Tetapkan Status Faskes"}</h5>
          <div className="verdict-edit-row">
            <select className="verdict-edit-select" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Pilih status faskes">
              <option value="">— pilih status —</option>
              {VERDICT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="primary-button" type="button" onClick={save} disabled={!selected || saving}>{saving ? "Menyimpan…" : "Simpan"}</button>
          </div>
          {stale && <p className="verdict-edit-note">Klaim ditandai/diubah setelah status terakhir ({progress?.last_verdict ? VERDICT_OPTIONS.find((o) => o.value === progress.last_verdict)?.label : "-"}).</p>}
        </div>}
        <h5>Riwayat Perubahan Klaim ({data.flags.length})</h5>
        {data.flags.length === 0 ? <p className="history-empty">Belum ada klaim yang ditandai.</p> : (
        <div className="history-table-wrap"><table className="history-table">
          <thead><tr><th>Klaim</th><th>Hasil</th><th>Oleh</th><th>Waktu</th></tr></thead>
          <tbody>{data.flags.map((f) => <tr key={f.claim_id}>
            <td className="history-ref">{f.claim_id}</td>
            <td><span className={`finding-tag f-${f.finding}`}>{FINDING_OPTIONS.find((o) => o.value === f.finding)?.label ?? f.finding}</span></td>
            <td className="history-by">{f.audited_by ?? "—"}</td>
            <td className="history-date">{fmtDateTime(f.at)}</td>
          </tr>)}</tbody>
        </table></div>)}
        <h5>Riwayat Perubahan Faskes ({data.verdicts.length})</h5>
        {data.verdicts.length === 0 ? <p className="history-empty">Belum ada status faskes yang dicatat.</p> : (
        <div className="history-table-wrap"><table className="history-table">
          <thead><tr><th>Status</th><th>Oleh</th><th>Waktu</th></tr></thead>
          <tbody>{data.verdicts.map((v) => <tr key={v.id}>
            <td><span className={`verdict-tag ${v.verdict === "confirmed" || v.verdict === "partially" ? "tag-positive" : "tag-negative"}`}>
              {VERDICT_OPTIONS.find((o) => o.value === v.verdict)?.label ?? v.verdict}</span>
              {v.auditor_notes && <span className="history-note">{v.auditor_notes}</span>}</td>
            <td className="history-by">{v.audited_by ?? "—"}</td>
            <td className="history-date">{fmtDateTime(v.decided_at)}</td>
          </tr>)}</tbody>
        </table></div>)}
      </div> : <div className="history-body"><p className="history-empty">Memuat riwayat…</p></div>)}
    </aside>
    </>
  );
}

// ---- Floating verdict bar (muncul saat semua klaim selesai diperiksa) ----
function suggestVerdict(p: Progress): string {
  if (p.flagged === 0 || p.total === 0) return "";
  const checked = p.fraud + p.admin + p.clean + p.review;
  if (checked === 0) return "";
  if (p.fraud === checked && checked >= 5) return "confirmed";
  if (p.fraud === checked && checked < 5) return "needs_followup";
  if (p.review > 0 && p.fraud + p.admin === 0) return "needs_followup";
  if (p.fraud > 0) return "partially";
  if (p.admin > 0 && p.clean + p.review === 0) return "administrative";
  if (p.clean === checked) return "clean";
  return "needs_followup";
}

function VerdictBar({ facility, progress, onSaved }: { facility: Faskes; progress: Progress; onSaved: () => void }) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const suggestion = suggestVerdict(progress);
  // bar muncul hanya saat: ada flag DAN belum ada vonis untuk flag-flag itu.
  // Vonis tersimpan + tidak ada flag baru = bar tidak muncul lagi, sampai
  // auditor mengubah flag (verdict_stale dari API: flag > vonis terakhir).
  const show = progress.flagged > 0 && !progress.last_verdict;
  const coverage = progress.total ? progress.flagged / progress.total : 0;
  const lowCoverage = coverage < 0.9;
  useEffect(() => { setSelected(suggestion); }, [suggestion]);
  if (!show) return null;
  const save = () => {
    if (!selected) return;
    setSaving(true);
    postJson<Verdict>("/api/verdicts", {
      kode: facility.kode, verdict: selected, audited_by: AUDITOR_NAME,
      auditor_notes: lowCoverage
        ? `Status berdasarkan sampel: ${progress.flagged} dari ${progress.total} klaim diperiksa.`
        : null,
    })
      .then(() => onSaved())
      .catch(() => setSaving(false))
      .finally(() => setSaving(false));
  };
  return (
    <div className="verdict-bar" role="dialog" aria-label="Usulan vonis faskes">
      <span className="vb-icon"><ClipboardCheck size={18} /></span>
      <p><b>{fmtNumber(progress.flagged)}/{fmtNumber(progress.total)}</b> klaim sudah ditandai ({progress.fraud} fraud, {progress.admin} administrasi, {progress.clean} bersih{progress.review > 0 ? `, ${progress.review} perlu ditinjau` : ""}). Kami usulkan vonis <b>{VERDICT_OPTIONS.find((o) => o.value === selected)?.label}</b> untuk faskes ini{lowCoverage ? " — vonis berdasarkan sampel terbatas" : ""}. Ubah kapan saja, atau konfirmasi sekarang.</p>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Pilih vonis">
        {VERDICT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="primary-button" type="button" onClick={save} disabled={!selected || saving}>{saving ? "Menyimpan…" : "Simpan vonis"}</button>
    </div>
  );
}

function DetailView({ facility, onBack, source }: { facility: Faskes; onBack: () => void; source: "sintetis" | "bpjs" }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  // lebar panel (resize) + tab offset mengikuti panel yang terbuka
  const [chatW, setChatW] = useState(400);
  const [histW, setHistW] = useState(400);
  useEffect(() => {
    document.documentElement.style.setProperty("--chat-tab-x", chatOpen ? `${chatW}px` : "0px");
  }, [chatOpen, chatW]);
  useEffect(() => {
    document.documentElement.style.setProperty("--hist-tab-x", histOpen ? `${histW}px` : "0px");
  }, [histOpen, histW]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadProgress = () =>
    fetchJson<Progress>(`/api/faskes/${facility.kode}/progress`)
      .then(setProgress).catch(() => setProgress(null));
  // flags tersimpan di DB - muat ulang saat buka faskes supaya tabel
  // menampilkan tanda yang sudah ada, bukan "belum" lagi
  const loadFlags = () =>
    fetchJson<HistoryData>(`/api/faskes/${facility.kode}/history`)
      .then((h) => {
        const map: Record<string, string> = {};
        for (const f of h.flags) map[f.claim_id] = f.finding;
        setFlags(map);
      }).catch(() => { });
  useEffect(() => { loadProgress(); loadFlags(); /* eslint-disable-next-line */ }, [facility.kode]);
  useEffect(() => { if (refreshKey) loadProgress(); /* eslint-disable-next-line */ }, [refreshKey]);

  useEffect(() => {
    setLoading(true);
    fetchJson<{ items: Claim[]; total: number }>(
      `/api/faskes/${facility.kode}/claims?page=${page}&page_size=${CLAIMS_PAGE_SIZE}&source=${source}`)
      .then((res) => { setClaims(res.items); setTotal(res.total); })
      .catch(() => { setClaims([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [facility.kode, page]);

  const flagClaim = (claimId: string, finding: string) => {
    setFlagBusy(claimId);
    postJson<{ claim_id: string; finding: string }>(`/api/claims/${claimId}/flag`, { provider: facility.kode, finding, audited_by: AUDITOR_NAME })
      .then(() => { setFlags((f) => ({ ...f, [claimId]: finding })); setRefreshKey((k) => k + 1); })
      .catch(() => { })
      .finally(() => setFlagBusy(null));
  };
  const unflagClaim = (claimId: string) => {
    setFlagBusy(claimId);
    fetch(`${API}/api/claims/${claimId}/flag`, { method: "DELETE" })
      .then(() => { setFlags((f) => { const n = { ...f }; delete n[claimId]; return n; }); setRefreshKey((k) => k + 1); })
      .catch(() => { })
      .finally(() => setFlagBusy(null));
  };

  const totalPages = Math.max(1, Math.ceil(total / CLAIMS_PAGE_SIZE));
  const detailStats = [{ label: "Skor Gabungan", value: fmtDecimal(facility.skor_gabungan) },
    { label: "Skor RF", value: facility.skor_gabungan_rf != null ? fmtDecimal(facility.skor_gabungan_rf) : "—" },
    { label: "Skor LOS", value: fmtDecimal(facility.skor_los) }, { label: "Skor Upcoding", value: fmtDecimal(facility.skor_upcoding) },
    { label: "Klaim Diperiksa", value: progress ? `${fmtNumber(progress.flagged)} / ${fmtNumber(progress.total)}` : "…" },
    { label: "Estimasi Kerugian", value: fmtRupiah(facility.estimasi_rugi) }];
  const progressPct = progress && progress.total ? Math.min(100, Math.round((progress.flagged / progress.total) * 100)) : 0;
  return <div id="view-detail" className="view-detail">
    <div className="detail-topbar">
      <button className="ghost-button back-button" id="btnBack" onClick={onBack}><ArrowLeft size={16} /> Kembali</button>
      <div className="detail-title"><span className="eyebrow">{source === "bpjs" ? "KELOMPOK FASKES TERPILIH" : "FASKES TERPILIH"}</span><h2 id="dTitle">Bukti Audit — {facility.kode}</h2>{facility.group_label && <p className="group-label">{facility.group_label}<br /><small>ID rumah sakit dihapus oleh BPJS dalam sampel publikasi — kelompok faskes, bukan rumah sakit per satuan.</small></p>}</div>
      <RiskBadge score={facility.skor_gabungan} id="dBadge" />
    </div>
    <StatBlocks id="dStats" items={detailStats} />
    <div className="check-progress">
      <div className="check-progress-copy"><ClipboardCheck size={16} /><span>Pemeriksaan: <b>{progress ? fmtNumber(progress.flagged) : "…"}</b> dari <b>{progress ? fmtNumber(progress.total) : "…"}</b> klaim sudah ditandai</span>
        {progress && progress.last_verdict && <span className="last-verdict-chip">vonis terakhir: {VERDICT_OPTIONS.find((o) => o.value === progress.last_verdict)?.label ?? progress.last_verdict}</span>}
      </div>
      <div className="loop-track"><span style={{ width: `${progressPct}%` }} /></div>
    </div>
    <section className="panel evidence-panel">
      <div className="panel-heading"><div><h2>Bukti per Klaim</h2><p id="dSub">{source === "bpjs" ? "Bukti klaim asli dari sampel publikasi BPJS — hanya untuk dibaca." : "Tandai hasil pemeriksaan per klaim. Saat semua klaim selesai ditandai, usulan vonis faskes muncul otomatis."}</p></div><span className="evidence-count"><FileText size={16} /> {fmtNumber(total)} klaim</span></div>
      <div className="tbl-wrap"><table aria-label="Bukti per klaim"><thead><tr><th>Klaim</th><th>Layanan</th><th>Kode CBG</th><th>Umur</th><th>LOS (hari)</th><th>Median Peer</th><th>Kelebihan (hari)</th><th>Outlier LOS</th><th>DX Berubah</th><th>Jumlah DX</th><th>Rasio Nilai</th><th>Hasil Periksa</th></tr></thead><tbody id="dTbody">{loading ? <tr><td colSpan={12} className="empty-note">Memuat bukti klaim…</td></tr> : claims.map((claim) => {
        const flagged = flags[claim.claim_id];
        return <tr key={claim.claim_id} className={flagged ? "row-flagged" : ""}>
          <td className="claim-id">{claim.claim_id}</td>
          <td>{claim.setting === "inpatient" ? "Rawat Inap" : "Rawat Jalan"}</td>
          <td>{claim.cbg ?? "—"}</td>
          <td className="num-cell">{fmtNumber(claim.umur)}</td>
          <td className="num-cell">{fmtNumber(claim.los)}</td>
          <td className="num-cell">{fmtDecimal(claim.peer_median, 1)}</td>
          <td className="num-cell bold-cell">{fmtDecimal(claim.excess, 1)}</td>
          <td>{claim.outlier ? <span className="yes-mark">Ya</span> : "—"}</td>
          <td>{claim.dx_change ? <span className="yes-mark">Ya</span> : "—"}</td>
          <td className="num-cell">{fmtNumber(claim.n_dx)}</td>
          <td className="num-cell">{fmtDecimal(claim.amt_ratio, 2)}</td>
          <td className="flag-cell">
            <select className="flag-select" value={flagged ?? ""} disabled={flagBusy === claim.claim_id}
              onChange={(e) => { const v = e.target.value; if (v) flagClaim(claim.claim_id, v); else if (flagged) unflagClaim(claim.claim_id); }}>
              <option value="">— belum —</option>
              {FINDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </td>
        </tr>; })}</tbody></table></div>
      <div className="pager"><span>Menampilkan {total ? (page - 1) * CLAIMS_PAGE_SIZE + 1 : 0}–{Math.min(page * CLAIMS_PAGE_SIZE, total)} dari {total} klaim</span><div className="pager-controls"><button className="ghost-button" disabled={page === 1} aria-label="Ke halaman awal" onClick={() => setPage(1)}>« Awal</button><button className="ghost-button" disabled={page === 1} aria-label="Ke halaman sebelumnya" onClick={() => setPage(page - 1)}>‹ Sebelumnya</button><span className="pager-status">Halaman {page} dari {totalPages}</span><button className="ghost-button" disabled={page === totalPages} aria-label="Ke halaman berikutnya" onClick={() => setPage(page + 1)}>Berikutnya ›</button><button className="ghost-button" disabled={page === totalPages} aria-label="Ke halaman terakhir" onClick={() => setPage(totalPages)}>Akhir »</button></div></div>
      <p className="evidence-footnote">Median peer dihitung dari kelompok kode CBG × rentang umur × tingkat komorbiditas dengan fallback hierarkis. Kolom LOS, median peer, dan outlier hanya terisi untuk klaim rawat inap. Tanda per klaim menjadi fitur model (flag_rate) dan dasar usulan vonis faskes.</p>
    </section>
    <AboutPanel />
    {progress && <VerdictBar facility={facility} progress={progress} onSaved={() => setRefreshKey((k) => k + 1)} />}
    <button className="chat-handle edge-tab" type="button" aria-label={chatOpen ? "Sembunyikan asisten" : "Tampilkan asisten"} onClick={() => setChatOpen(!chatOpen)}>{chatOpen ? "›" : "‹"}</button>
    <button className="history-handle edge-tab" type="button" aria-label={histOpen ? "Sembunyikan riwayat" : "Tampilkan riwayat"} onClick={() => setHistOpen(!histOpen)}>{histOpen ? "›" : "‹"}</button>
    <ChatPanel facility={facility} open={chatOpen} onClose={() => setChatOpen(!chatOpen)} width={chatW} setWidth={setChatW} />
    <HistoryPanel facility={facility} open={histOpen} onClose={() => setHistOpen(!histOpen)} refreshKey={refreshKey} progress={progress} onSaved={() => setRefreshKey((k) => k + 1)} width={histW} setWidth={setHistW} />
  </div>;
}

function DashboardView({ onLogout }: { onLogout: () => void }) {
  const [threshold, setThreshold] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyEv, setOnlyEv] = useState(true);
  const [page, setPage] = useState(1);
  // hash routing: #/faskes/RS1792 - reload-safe + deep-link ke detail faskes
  const readHash = () => {
    const m = window.location.hash.match(/^#\/faskes\/([A-Za-z0-9-]+)/);
    return m ? m[1] : null;
  };
  const [detailCode, setDetailCode] = useState<string | null>(() => readHash());
  const [faskes, setFaskes] = useState<Faskes[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onHash = () => setDetailCode(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // sumber data: sintetis (demo per-faskes penuh) | bpjs (kelompok faskes,
  // ID RS dihapus BPJS - view-only)
  const [source, setSource] = useState<"sintetis" | "bpjs">("sintetis");
  useEffect(() => {
    setError(false);
    fetchJson<Faskes[]>(`/api/faskes?source=${source}`).then(setFaskes).catch(() => setError(true));
    fetchJson<Stats>(`/api/stats?source=${source}`).then(setStats).catch(() => { });
    setDetailCode(null);
    window.location.hash = "";
    setPage(1);
  }, [source]);

  const filteredList = useMemo(() => faskes.filter((item) => item.skor_gabungan >= threshold / 100 && item.kode.toLowerCase().includes(query.toLowerCase()) && (!onlyEv || item.klaim_ri > 0)), [faskes, threshold, query, onlyEv]);
  const facility = faskes.find((item) => item.kode === detailCode);
  const statItems = [
    { label: "Faskes dinilai", value: stats ? fmtNumber(stats.faskes) : "…" },
    { label: "Memenuhi ambang & filter", value: String(filteredList.length) },
    { label: "Memiliki klaim rawat inap", value: stats ? fmtNumber(stats.beri_ri) : "…" },
    { label: "Total klaim (RI + RJ)", value: stats ? fmtNumber(stats.klaim_ri + stats.klaim_rj) : "…" },
    { label: "Total estimasi kerugian (LOS)", value: stats ? fmtRupiah(stats.rugi) : "…" }];
  const openDetail = (kode: string) => { window.location.hash = `#/faskes/${kode}`; window.scrollTo({ top: 0, behavior: "smooth" }); };
  const [randomOpen, setRandomOpen] = useState(false);
  const [randomList, setRandomList] = useState<Faskes[]>([]);
  const [randomLoading, setRandomLoading] = useState(false);
  const drawRandom = () => {
    setRandomLoading(true);
    fetchJson<{ items: Faskes[] }>("/api/sample?n=20").then((r) => setRandomList(r.items))
      .catch(() => setRandomList([])).finally(() => setRandomLoading(false));
    setRandomOpen(true);
  };
  const showMain = () => { window.location.hash = ""; window.scrollTo({ top: 0, behavior: "smooth" }); };
  const goPage = (nextPage: number) => setPage(Math.max(1, Math.min(Math.ceil(filteredList.length / PAGE_SIZE) || 1, nextPage)));
  const setThresholdAndReset = (value: number) => { setThreshold(value); setPage(1); };
  const setQueryAndReset = (value: string) => { setQuery(value); setPage(1); };
  const setOnlyEvAndReset = (value: boolean) => { setOnlyEv(value); setPage(1); };
  if (facility) return <><Header onLogout={onLogout} /><main className="app-main"><DetailView facility={facility} onBack={showMain} source={source} /></main></>;
  return <><Header onLogout={onLogout} /><main className="app-main" id="view-main"><div className="page-intro"><div><p className="eyebrow">RUANG KERJA AUDITOR</p><h2>Prioritas pemeriksaan faskes</h2><p className="intro-copy">Gunakan ambang skor dan filter untuk menyusun antrean audit berdasarkan bukti anomali.</p></div><div className="intro-actions"><div className="source-toggle" role="group" aria-label="Sumber data"><button className={`source-opt ${source === "sintetis" ? "src-active" : ""}`} type="button" onClick={() => setSource("sintetis")}>Data Sintetis</button><button className={`source-opt ${source === "bpjs" ? "src-active" : ""}`} type="button" onClick={() => setSource("bpjs")}>Data BPJS</button></div><button className="ghost-button sample-button" type="button" onClick={drawRandom} disabled={randomLoading || source === "bpjs"}><Shuffle size={16} /> {randomLoading ? "Mengambil…" : "Sampel kontrol acak"}</button><div className="last-sync"><span className="status-dot" /> Data terakhir diperbarui <strong>04 Sep 2026, 18:15 WIB</strong></div></div></div>{source === "bpjs" && <div className="bpjs-notice"><ShieldCheck size={16} /><span>Menampilkan <b>Data Sampel Reguler Edisi 2025</b> (resmi BPJS): 1,7 juta klaim asli 2024. ID rumah sakit dihapus oleh BPJS dalam sampel ini — unit tampilan adalah <b>kelompok faskes</b> (kabupaten × kelas × kepemilikan), bukan rumah sakit per satuan. Mode ini hanya untuk membaca bukti.</span></div>}
{randomOpen && <section className="panel random-panel"><div className="panel-heading"><div><h2>Sampel Kontrol Acak</h2><p>20 faskes acar dari populasi penuh, dikecualikan yang sudah divonis siklus ini. Periksa sama seriusnya dengan daftar prioritas — vonis dari sampel ini mencegah model hanya belajar dari pilihan sistemnya sendiri.</p></div><button className="ghost-button" type="button" onClick={() => setRandomOpen(false)}>Tutup</button></div><div className="random-grid">{randomList.map((f) => <button className="random-card" type="button" key={f.kode} onClick={() => openDetail(f.kode)}><span className="facility-code">{f.kode}</span><span className="random-rank">peringkat #{fmtNumber(f.peringkat)}</span><RiskBadge score={f.skor_gabungan} /></button>)}</div></section>}{error && <div className="empty-note">Gagal memuat data dari server. Pastikan API berjalan.</div>}{!error && faskes.length === 0 && <div className="empty-note">Memuat data faskes…</div>}{faskes.length > 0 && <><StatBlocks id="stats" items={statItems} /><ControlStrip threshold={threshold} setThreshold={setThresholdAndReset} query={query} setQuery={setQueryAndReset} onlyEv={onlyEv} setOnlyEv={setOnlyEvAndReset} /><PriorityTable list={filteredList} page={page} goPage={goPage} openDetail={openDetail} /><AboutPanel /></>}</main></>;
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(() => {
    try { return window.localStorage.getItem("ai_session") === "1"; }
    catch { return false; }
  });
  const login = () => {
    try { window.localStorage.setItem("ai_session", "1"); } catch { /* storage tidak tersedia */ }
    setLoggedIn(true);
  };
  const logout = () => {
    try { window.localStorage.removeItem("ai_session"); } catch { /* noop */ }
    setLoggedIn(false);
  };
  return loggedIn ? <DashboardView onLogout={logout} /> : <LoginView onLogin={login} />;
}
