import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileText,
  KeyRound,
  LockKeyhole,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE ?? "";
const PAGE_SIZE = 15;
const CLAIMS_PAGE_SIZE = 15;

type Faskes = {
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
        <div className="login-footer">© 2026 BPJS Kesehatan · Sistem Audit Intelligence</div>
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
  return <header className="app-header"><div className="header-brand"><LogoMark /><div><h1>Audit Intelligence <span>— Peringkat Risiko Faskes</span></h1><p>Prototipe mesin skoring risiko faskes · data demo sintetis JKN / INA-CBG · skor merupakan prioritas audit, bukan vonis fraud</p></div></div><div className="header-actions"><span className="mode-chip">Prototipe</span><button className="profile-button" type="button" aria-label="Profil auditor"><span className="profile-avatar">AP</span><span className="profile-label">A. Prasetyo</span><ChevronRight size={15} /></button><button className="logout-button" type="button" aria-label="Keluar" onClick={onLogout}>Keluar</button></div></header>;
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
    <li>Data yang ditampilkan merupakan data sintetis untuk keperluan prototipe, mengikuti struktur kode INA-CBG sesuai Permenkes Nomor 26 Tahun 2021. Metodologi telah diuji pada data sampel publikasi resmi BPJS (Data Sampel Reguler Edisi 2025).</li>
  </ol><div className="about-divider" /><p className="about-footer">Sistem Audit Intelligence merupakan prototipe yang dibangun untuk keperluan kompetisi. Seluruh angka berasal dari data sintetis skala nasional tahun 2025 dan tidak merepresentasikan kondisi aktual fasilitas kesehatan.</p></section>;
}

// ---- Panel chat asisten (right panel) ----
// Struktur siap untuk Track B: chat grounding pada konteks faskes terpilih.
// Saat ini respons contoh; nanti dihubungkan ke API AI (coding review assist).
function ChatPanel({ facility, open, onClose }: { facility: Faskes; open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: "ai" | "user"; text: string }[]>([
    { role: "ai", text: `Halo! Saya bisa membantu membaca bukti audit ${facility.kode}: menjelaskan skor, merangkum pola anomali, atau menyiapkan draf catatan pemeriksaan.` },
  ]);
  const [input, setInput] = useState("");
  const chips = ["Kenapa risikonya tinggi?", "Ringkas outlier LOS", "Buat draf catatan audit"];
  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }, { role: "ai", text: "Respons contoh. Panel ini akan dihubungkan ke API asisten AI (Track B) untuk analisis klaim berbasis konteks faskes ini." }]);
    setInput("");
  };
  return (
    <aside className={`chat-panel ${open ? "chat-open" : ""}`} aria-label="Asisten AI">
      <div className="chat-head">
        <div className="chat-bot-mark">AI</div>
        <div><h4>Asisten Audit</h4><small>Analisis klaim · konteks: {facility.kode}</small></div>
        <button className="chat-close" type="button" aria-label="Tutup asisten" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="chat-ctx">Konteks: <b>{facility.kode}</b> · Risiko {risk(facility.skor_gabungan).label} · {fmtNumber(facility.klaim_ri + facility.klaim_rj)} klaim</div>
      <div className="chat-msgs">{messages.map((m, i) => m.role === "ai"
        ? <div className="chat-m chat-m-ai" key={i}><span className="chat-name">Asisten Audit</span>{m.text}</div>
        : <div className="chat-m chat-m-user" key={i}>{m.text}</div>)}</div>
      <div className="chat-chips">{chips.map((c) => <button className="chat-chip" type="button" key={c} onClick={() => send(c)}>{c}</button>)}</div>
      <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea rows={1} placeholder="Tanya tentang klaim ini…" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="chat-send" type="submit" aria-label="Kirim"><Send size={16} /></button>
      </form>
    </aside>
  );
}

// ---- Panel vonis auditor (Track A feedback loop) ----
const VERDICT_OPTIONS = [
  { value: "confirmed", label: "Konfirmasi fraud" },
  { value: "partially", label: "Sebagian terkonfirmasi" },
  { value: "clean", label: "Bersih" },
  { value: "administrative", label: "Masalah administratif" },
  { value: "needs_followup", label: "Perlu tindak lanjut" },
];

function VerdictPanel({ facility, onSaved }: { facility: Faskes; onSaved?: () => void }) {
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [selected, setSelected] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = () => fetchJson<{ items: Verdict[] }>(`/api/verdicts/${facility.kode}`)
    .then((r) => setVerdicts(r.items)).catch(() => setVerdicts([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [facility.kode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true); setFeedback("");
    postJson<Verdict>("/api/verdicts", { kode: facility.kode, verdict: selected, auditor_notes: notes || null })
      .then(() => {
        setSelected(""); setNotes("");
        setFeedback("Vonis tersimpan — menjadi data latih model berikutnya.");
        load(); onSaved?.();
      })
      .catch(() => setFeedback("Gagal menyimpan vonis."))
      .finally(() => setSaving(false));
  };

  return (
    <section className="panel verdict-panel">
      <div className="panel-heading"><div><h2>Vonis Auditor</h2><p>Hasil pemeriksaan dicatat apa adanya dan menjadi data latih skor RF. Ambang retrain model: 100 vonis nyata.</p></div><ClipboardCheck size={18} /></div>
      <form className="verdict-form" onSubmit={submit}>
        <div className="verdict-options">{VERDICT_OPTIONS.map((v) => (
          <label className={`verdict-opt ${selected === v.value ? "opt-active" : ""}`} key={v.value}>
            <input type="radio" name="verdict" value={v.value} checked={selected === v.value} onChange={() => setSelected(v.value)} />
            {v.label}
          </label>))}</div>
        <textarea rows={2} placeholder="Catatan auditor (opsional) — dasar pemeriksaan, klaim yang ditelusuri…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="primary-button" type="submit" disabled={!selected || saving}>{saving ? "Menyimpan…" : "Catat vonis"}</button>
        {feedback && <span className="verdict-feedback">{feedback}</span>}
      </form>
      {verdicts.length > 0 && <div className="verdict-history"><h3>Riwayat vonis faskes ini</h3><ul>{verdicts.map((v) => (
        <li key={v.id}><span className={`verdict-tag ${v.verdict === "confirmed" || v.verdict === "partially" ? "tag-positive" : "tag-negative"}`}>
          {VERDICT_OPTIONS.find((o) => o.value === v.verdict)?.label ?? v.verdict}</span>
          <span className="verdict-date">{new Date(v.decided_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · siklus {v.period}</span>
          {v.auditor_notes && <span className="verdict-note">{v.auditor_notes}</span>}</li>))}</ul></div>}
    </section>
  );
}

function LoopStatusStrip() {
  const [status, setStatus] = useState<{ threshold: number; total: number; real_total: number; positive: number } | null>(null);
  useEffect(() => { fetchJson<typeof status>("/api/verdicts").then(setStatus).catch(() => { }); }, []);
  if (!status) return null;
  const pct = Math.min(100, Math.round((status.real_total / status.threshold) * 100));
  return <div className="loop-strip"><div className="loop-copy"><Sparkles size={16} /><span>Loop pembelajaran: <b>{status.real_total}</b> vonis nyata terkumpul dari ambang <b>{status.threshold}</b> — model RF dilatih ulang otomatis saat ambang tercapai.</span></div><div className="loop-track"><span style={{ width: `${pct}%` }} /></div></div>;
}

function DetailView({ facility, onBack }: { facility: Faskes; onBack: () => void }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchJson<{ items: Claim[]; total: number }>(
      `/api/faskes/${facility.kode}/claims?page=${page}&page_size=${CLAIMS_PAGE_SIZE}`)
      .then((res) => { setClaims(res.items); setTotal(res.total); })
      .catch(() => { setClaims([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [facility.kode, page]);

  const totalPages = Math.max(1, Math.ceil(total / CLAIMS_PAGE_SIZE));
  const detailStats = [{ label: "Skor Gabungan", value: fmtDecimal(facility.skor_gabungan) },
    { label: "Skor RF", value: facility.skor_gabungan_rf != null ? fmtDecimal(facility.skor_gabungan_rf) : "—" },
    { label: "Skor LOS", value: fmtDecimal(facility.skor_los) }, { label: "Skor Upcoding", value: fmtDecimal(facility.skor_upcoding) }, { label: "Klaim Rawat Inap", value: fmtNumber(facility.klaim_ri) }, { label: "Klaim Rawat Jalan", value: fmtNumber(facility.klaim_rj) }, { label: "Estimasi Kerugian", value: fmtRupiah(facility.estimasi_rugi) }];
  return <div id="view-detail" className={`view-detail ${chatOpen ? "with-chat" : ""}`}><div className="detail-topbar"><button className="ghost-button back-button" id="btnBack" onClick={onBack}><ArrowLeft size={16} /> Kembali</button><div className="detail-title"><span className="eyebrow">FASKES TERPILIH</span><h2 id="dTitle">Bukti Audit — {facility.kode}</h2></div><RiskBadge score={facility.skor_gabungan} id="dBadge" /><button className="ghost-button chat-toggle" type="button" onClick={() => setChatOpen(!chatOpen)}><Sparkles size={16} /> Asisten AI</button></div><StatBlocks id="dStats" items={detailStats} /><LoopStatusStrip /><VerdictPanel facility={facility} /><section className="panel evidence-panel"><div className="panel-heading"><div><h2>Bukti per Klaim</h2><p id="dSub">Menampilkan seluruh {fmtNumber(facility.klaim_ri + facility.klaim_rj)} klaim faskes ini, diurutkan dari sinyal anomali terkuat.</p></div><span className="evidence-count"><FileText size={16} /> {fmtNumber(total)} klaim</span></div><div className="tbl-wrap"><table aria-label="Bukti per klaim"><thead><tr><th>Klaim</th><th>Layanan</th><th>Kode CBG</th><th>Umur</th><th>LOS (hari)</th><th>Median Peer</th><th>Kelebihan (hari)</th><th>Outlier LOS</th><th>DX Berubah</th><th>Jumlah DX</th><th>Rasio Nilai</th></tr></thead><tbody id="dTbody">{loading ? <tr><td colSpan={11} className="empty-note">Memuat bukti klaim…</td></tr> : claims.map((claim) => <tr key={claim.claim_id}><td className="claim-id">{claim.claim_id}</td><td>{claim.setting === "inpatient" ? "Rawat Inap" : "Rawat Jalan"}</td><td>{claim.cbg ?? "—"}</td><td className="num-cell">{fmtNumber(claim.umur)}</td><td className="num-cell">{fmtNumber(claim.los)}</td><td className="num-cell">{fmtDecimal(claim.peer_median, 1)}</td><td className="num-cell bold-cell">{fmtDecimal(claim.excess, 1)}</td><td>{claim.outlier ? <span className="yes-mark">Ya</span> : "—"}</td><td>{claim.dx_change ? <span className="yes-mark">Ya</span> : "—"}</td><td className="num-cell">{fmtNumber(claim.n_dx)}</td><td className="num-cell">{fmtDecimal(claim.amt_ratio, 2)}</td></tr>)}</tbody></table></div><div className="pager"><span>Menampilkan {total ? (page - 1) * CLAIMS_PAGE_SIZE + 1 : 0}–{Math.min(page * CLAIMS_PAGE_SIZE, total)} dari {total} klaim</span><div className="pager-controls"><button className="ghost-button" disabled={page === 1} aria-label="Ke halaman awal" onClick={() => setPage(1)}>« Awal</button><button className="ghost-button" disabled={page === 1} aria-label="Ke halaman sebelumnya" onClick={() => setPage(page - 1)}>‹ Sebelumnya</button><span className="pager-status">Halaman {page} dari {totalPages}</span><button className="ghost-button" disabled={page === totalPages} aria-label="Ke halaman berikutnya" onClick={() => setPage(page + 1)}>Berikutnya ›</button><button className="ghost-button" disabled={page === totalPages} aria-label="Ke halaman terakhir" onClick={() => setPage(totalPages)}>Akhir »</button></div></div><p className="evidence-footnote">Median peer dihitung dari kelompok kode CBG × rentang umur × tingkat komorbiditas dengan fallback hierarkis. Kolom LOS, median peer, dan outlier hanya terisi untuk klaim rawat inap. Tabel ini dapat digunakan sebagai lampiran pemeriksaan.</p></section><AboutPanel />{chatOpen && <ChatPanel facility={facility} open={chatOpen} onClose={() => setChatOpen(false)} />}</div>;
}

function DashboardView({ onLogout }: { onLogout: () => void }) {
  const [threshold, setThreshold] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyEv, setOnlyEv] = useState(true);
  const [page, setPage] = useState(1);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [faskes, setFaskes] = useState<Faskes[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchJson<Faskes[]>("/api/faskes").then(setFaskes).catch(() => setError(true));
    fetchJson<Stats>("/api/stats").then(setStats).catch(() => { });
  }, []);

  const filteredList = useMemo(() => faskes.filter((item) => item.skor_gabungan >= threshold / 100 && item.kode.toLowerCase().includes(query.toLowerCase()) && (!onlyEv || item.klaim_ri > 0)), [faskes, threshold, query, onlyEv]);
  const facility = faskes.find((item) => item.kode === detailCode);
  const statItems = [
    { label: "Faskes dinilai", value: stats ? fmtNumber(stats.faskes) : "…" },
    { label: "Memenuhi ambang & filter", value: String(filteredList.length) },
    { label: "Memiliki klaim rawat inap", value: stats ? fmtNumber(stats.beri_ri) : "…" },
    { label: "Total klaim (RI + RJ)", value: stats ? fmtNumber(stats.klaim_ri + stats.klaim_rj) : "…" },
    { label: "Total estimasi kerugian (LOS)", value: stats ? fmtRupiah(stats.rugi) : "…" }];
  const openDetail = (kode: string) => { setDetailCode(kode); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const showMain = () => { setDetailCode(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const goPage = (nextPage: number) => setPage(Math.max(1, Math.min(Math.ceil(filteredList.length / PAGE_SIZE) || 1, nextPage)));
  const setThresholdAndReset = (value: number) => { setThreshold(value); setPage(1); };
  const setQueryAndReset = (value: string) => { setQuery(value); setPage(1); };
  const setOnlyEvAndReset = (value: boolean) => { setOnlyEv(value); setPage(1); };
  if (facility) return <><Header onLogout={onLogout} /><main className="app-main"><DetailView facility={facility} onBack={showMain} /></main></>;
  return <><Header onLogout={onLogout} /><main className="app-main" id="view-main"><div className="page-intro"><div><p className="eyebrow">RUANG KERJA AUDITOR</p><h2>Prioritas pemeriksaan faskes</h2><p className="intro-copy">Gunakan ambang skor dan filter untuk menyusun antrean audit berdasarkan bukti anomali.</p></div><div className="last-sync"><span className="status-dot" /> Data terakhir diperbarui <strong>04 Sep 2026, 18:15 WIB</strong></div></div>{error && <div className="empty-note">Gagal memuat data dari server. Pastikan API berjalan.</div>}{!error && faskes.length === 0 && <div className="empty-note">Memuat data faskes…</div>}{faskes.length > 0 && <><StatBlocks id="stats" items={statItems} /><ControlStrip threshold={threshold} setThreshold={setThresholdAndReset} query={query} setQuery={setQueryAndReset} onlyEv={onlyEv} setOnlyEv={setOnlyEvAndReset} /><PriorityTable list={filteredList} page={page} goPage={goPage} openDetail={openDetail} /><AboutPanel /></>}</main></>;
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
