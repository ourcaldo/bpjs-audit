import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ponytail: relaxed TLS check — Neon demo service; strict verify if this ever holds real data
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ah =
  (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch((e: unknown) =>
      res.status(500).json({ detail: e instanceof Error ? e.message : String(e) }));

// -------------------------------------------------------------------------
// API — port 1:1 dari api/main.py (FastAPI). Satu service, satu origin.
// -------------------------------------------------------------------------
const CHRONIC =
  "((p.chronic_1=1)::int + (p.chronic_2=1)::int + (p.chronic_3=1)::int + " +
  "(p.chronic_4=1)::int + (p.chronic_5=1)::int + (p.chronic_6=1)::int + " +
  "(p.chronic_7=1)::int + (p.chronic_8=1)::int + (p.chronic_9=1)::int + " +
  "(p.chronic_10=1)::int + (p.chronic_11=1)::int)";

const AGE_EXPR = `CASE WHEN p.dob IS NULL THEN NULL
     WHEN EXTRACT(YEAR FROM age(k.admission_dt, p.dob)) < 1 THEN NULL
     WHEN EXTRACT(YEAR FROM age(k.admission_dt, p.dob)) <= 40 THEN 0
     WHEN EXTRACT(YEAR FROM age(k.admission_dt, p.dob)) <= 60 THEN 1
     WHEN EXTRACT(YEAR FROM age(k.admission_dt, p.dob)) <= 75 THEN 2
     ELSE 3 END`;

const COM_EXPR = `CASE WHEN ${CHRONIC} <= 1 THEN 0 WHEN ${CHRONIC} <= 3 THEN 1 WHEN ${CHRONIC} <= 5 THEN 2 ELSE 3 END`;

const BASE_FROM = `FROM klaim_rawat_inap k LEFT JOIN data_pasien p USING (bene_id)
     WHERE (k.discharge_dt - k.admission_dt) >= 0`;

const LOS_EXPR = "(k.discharge_dt - k.admission_dt)";

async function refreshScores(client: pg.PoolClient, provider: string) {
  await client.query(`
    UPDATE faskes_scores s SET
        ip_n_claims = a.n, los_outlier_rate = a.orr, los_excess_mean = a.exm,
        excess_cost_sum = a.rugi, ip_dx_changed_rate = a.dxc,
        ip_n_dx_mean = a.ndx, ip_amt_ratio_mean = a.amtr
    FROM (SELECT COUNT(*) n, AVG(outlier) orr, AVG(excess) exm, SUM(rugi) rugi,
                 AVG(dx_change) dxc, AVG(n_dx) ndx, AVG(amt_ratio) amtr
          FROM claim_evidence WHERE provider = $1 AND setting = 'inpatient') a
    WHERE s.provider = $2`, [provider, provider]);
  await client.query(`
    WITH ranked AS (
        SELECT provider, op_amt_ratio_mean,
               CASE WHEN ip_n_claims > 0 THEN (
                   percent_rank() OVER (ORDER BY los_outlier_rate)
                 + percent_rank() OVER (ORDER BY los_excess_mean)) / 2 END AS skor_los,
               CASE WHEN ip_n_claims > 0 THEN (
                   percent_rank() OVER (ORDER BY ip_dx_changed_rate)
                 + percent_rank() OVER (ORDER BY ip_n_dx_mean)
                 + percent_rank() OVER (ORDER BY ip_amt_ratio_mean)) / 3 END AS skor_up
        FROM faskes_scores
    ), gab AS (
        SELECT provider, skor_los, skor_up,
               CASE WHEN skor_los IS NOT NULL AND skor_up IS NOT NULL
                         THEN (skor_los + skor_up) / 2
                    WHEN skor_los IS NOT NULL THEN skor_los
                    WHEN skor_up IS NOT NULL THEN skor_up
                    WHEN op_amt_ratio_mean IS NOT NULL
                         THEN percent_rank() OVER (ORDER BY op_amt_ratio_mean)
                    ELSE 0 END AS skor_gabungan
        FROM ranked
    )
    UPDATE faskes_scores s
    SET skor_los = g.skor_los, skor_upcoding = g.skor_up,
        skor_gabungan = g.skor_gabungan
    FROM gab g WHERE s.provider = g.provider`);
  await client.query(`
    UPDATE faskes_scores s SET peringkat = t.rk
    FROM (SELECT provider, RANK() OVER (ORDER BY skor_gabungan DESC) rk
          FROM faskes_scores) t
    WHERE s.provider = t.provider`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json());

  app.get("/api/faskes", ah(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT provider AS kode, peringkat::int AS peringkat,
             skor_gabungan::float8, skor_gabungan_rf::float8,
             skor_los::float8, skor_upcoding::float8,
             ip_n_claims::int AS klaim_ri, op_n_claims::int AS klaim_rj,
             excess_cost_sum::float8 AS estimasi_rugi
      FROM faskes_scores ORDER BY peringkat`);
    res.json(rows);
  }));

  app.get("/api/stats", ah(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS faskes,
             COUNT(*) FILTER (WHERE ip_n_claims > 0)::int AS beri_ri,
             COALESCE(SUM(excess_cost_sum), 0)::float8 AS rugi,
             COALESCE(SUM(ip_n_claims), 0)::int AS klaim_ri,
             COALESCE(SUM(op_n_claims), 0)::int AS klaim_rj
      FROM faskes_scores`);
    res.json(rows[0]);
  }));

  app.get("/api/faskes/:kode", ah(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT provider AS kode, peringkat::int AS peringkat,
             skor_gabungan::float8, skor_los::float8, skor_upcoding::float8,
             ip_n_claims::int AS klaim_ri, op_n_claims::int AS klaim_rj,
             excess_cost_sum::float8 AS estimasi_rugi,
             los_outlier_rate::float8, los_excess_mean::float8,
             ip_dx_changed_rate::float8, ip_n_dx_mean::float8,
             ip_amt_ratio_mean::float8
      FROM faskes_scores WHERE provider = $1`, [req.params.kode]);
    if (!rows.length) return res.status(404).json({ detail: "faskes tidak ditemukan" });
    res.json(rows[0]);
  }));

  app.get("/api/faskes/:kode/claims", ah(async (req, res) => {
    const kode = req.params.kode;
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const page_size = Math.min(100, Math.max(1, parseInt(String(req.query.page_size), 10) || 15));
    const ex = await pool.query("SELECT 1 FROM faskes_scores WHERE provider = $1", [kode]);
    if (!ex.rowCount) return res.status(404).json({ detail: "faskes tidak ditemukan" });
    const { rows } = await pool.query(`
      SELECT claim_id, provider AS kode, cbg, umur::int AS umur, los::int AS los,
             peer_median::float8, excess::int AS excess, outlier::int AS outlier,
             rugi::float8, setting, dx_change::int AS dx_change,
             n_dx::int AS n_dx, amt_ratio::float8
      FROM claim_evidence
      WHERE provider = $1
      ORDER BY (COALESCE(excess,0)/10.0 + COALESCE(outlier,0)*0.4
                + GREATEST(COALESCE(amt_ratio,1) - 1, 0)/4.0) DESC NULLS LAST,
               claim_id
      LIMIT $2 OFFSET $3`, [kode, page_size, (page - 1) * page_size]);
    const t = await pool.query(
      "SELECT COUNT(*)::int AS n FROM claim_evidence WHERE provider = $1", [kode]);
    res.json({ items: rows, total: t.rows[0].n, page, page_size });
  }));

  // ---- Track A: vonis auditor (feedback loop) ----
  const VERDICTS = ["confirmed", "partially", "clean", "administrative", "needs_followup"] as const;
  const CLAIM_FINDINGS = ["fraud", "administrative", "clean", "needs_review"] as const;

  // flag satu klaim (ritme harian auditor; jadi fitur RF flag_rate + bahan Track B)
  app.post("/api/claims/:id/flag", ah(async (req, res) => {
    const b = req.body ?? {};
    const finding = b.finding;
    if (typeof finding !== "string" || !CLAIM_FINDINGS.includes(finding as never))
      return res.status(422).json({ detail: `finding harus salah satu: ${CLAIM_FINDINGS.join(", ")}` });
    const notes = typeof b.notes === "string" ? b.notes : null;
    const { rows } = await pool.query(`
      INSERT INTO claim_flag (claim_id, provider, finding, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (claim_id) DO UPDATE
        SET finding = EXCLUDED.finding, notes = EXCLUDED.notes, flagged_at = now()
      RETURNING claim_id, provider, finding, notes, flagged_at`,
      [req.params.id, b.provider ?? null, finding, notes]);
    res.status(201).json(rows[0]);
  }));

  app.delete("/api/claims/:id/flag", ah(async (req, res) => {
    await pool.query("DELETE FROM claim_flag WHERE claim_id = $1", [req.params.id]);
    res.status(204).end();
  }));

  // status pemeriksaan faskes: berapa klaim sudah diflag vs total
  app.get("/api/faskes/:kode/progress", ah(async (req, res) => {
    const kode = req.params.kode;
    const t = await pool.query(
      "SELECT COUNT(*)::int AS n FROM claim_evidence WHERE provider = $1", [kode]);
    const f = await pool.query(`
      SELECT COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE finding = 'fraud')::int AS fraud,
             COUNT(*) FILTER (WHERE finding = 'administrative')::int AS admin,
             COUNT(*) FILTER (WHERE finding = 'clean')::int AS clean,
             COUNT(*) FILTER (WHERE finding = 'needs_review')::int AS review
      FROM claim_flag WHERE provider = $1`, [kode]);
    const v = await pool.query(`
      SELECT verdict FROM audit_outcome WHERE provider = $1
      ORDER BY decided_at DESC LIMIT 1`, [kode]);
    res.json({
      total: t.rows[0].n, flagged: f.rows[0].n,
      fraud: f.rows[0].fraud, admin: f.rows[0].admin,
      clean: f.rows[0].clean, review: f.rows[0].review,
      last_verdict: v.rows[0]?.verdict ?? null,
    });
  }));

  // riwayat lengkap satu faskes: flag klaim + vonis, urut waktu (panel riwayat)
  app.get("/api/faskes/:kode/history", ah(async (req, res) => {
    const flags = await pool.query(`
      SELECT claim_id, finding, notes, flagged_at AS at
      FROM claim_flag WHERE provider = $1
      ORDER BY flagged_at DESC LIMIT 100`, [req.params.kode]);
    const verdicts = await pool.query(`
      SELECT verdict, auditor_notes, period, decided_at AS at
      FROM audit_outcome WHERE provider = $1
      ORDER BY decided_at DESC LIMIT 50`, [req.params.kode]);
    res.json({ flags: flags.rows, verdicts: verdicts.rows });
  }));

  // riwayat vonis satu faskes
  app.get("/api/verdicts/:kode", ah(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT id, provider AS kode, period, verdict, auditor_notes, sample_kind,
             decided_at
      FROM audit_outcome WHERE provider = $1 ORDER BY decided_at DESC`, [req.params.kode]);
    res.json({ items: rows });
  }));

  // sampel kontrol acak: N faskes dari populasi penuh, belum divonis siklus ini.
  // Dasar kebijakan anti-selection-bias Track A: auditor memeriksa sampel acak
  // sama seriusnya dengan daftar prioritas -> model beli contoh jujur dari
  // faskes yang bersih, bukan hanya dari pilihan sistem sendiri.
  app.get("/api/sample", ah(async (req, res) => {
    const n = Math.min(50, Math.max(1, parseInt(String(req.query.n), 10) || 20));
    const { rows } = await pool.query(`
      SELECT s.provider AS kode, s.peringkat::int AS peringkat,
             s.skor_gabungan::float8, s.skor_gabungan_rf::float8,
             s.skor_los::float8, s.skor_upcoding::float8,
             s.ip_n_claims::int AS klaim_ri, s.op_n_claims::int AS klaim_rj,
             s.excess_cost_sum::float8 AS estimasi_rugi
      FROM faskes_scores s
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_outcome a
        WHERE a.provider = s.provider
          AND a.period = to_char(now(), 'YYYY-MM')
          AND (a.auditor_notes IS NULL OR a.auditor_notes NOT LIKE '%seed demo%'))
      ORDER BY random() LIMIT $1`, [n]);
    res.json({ items: rows });
  }));

  // status loop pembelajaran: jumlah vonis nyata vs ambang retrain
  app.get("/api/verdicts", ah(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE auditor_notes IS NULL
                              OR auditor_notes NOT LIKE '%seed demo%')::int AS real_total,
             COUNT(*) FILTER (WHERE verdict IN ('confirmed','partially'))::int AS positive
      FROM audit_outcome`);
    res.json({ threshold: 100, ...rows[0] });
  }));

  // catat satu vonis auditor
  app.post("/api/verdicts", ah(async (req, res) => {
    const b = req.body ?? {};
    const kode = b.kode, verdict = b.verdict;
    if (typeof kode !== "string" || !kode)
      return res.status(422).json({ detail: "kode faskes wajib" });
    if (typeof verdict !== "string" || !VERDICTS.includes(verdict as never))
      return res.status(422).json({ detail: `verdict harus salah satu: ${VERDICTS.join(", ")}` });
    const notes = typeof b.auditor_notes === "string" ? b.auditor_notes : null;
    const sample_kind = b.sample_kind === "random" ? "random" : "priority";
    const ex = await pool.query("SELECT 1 FROM faskes_scores WHERE provider = $1", [kode]);
    if (!ex.rowCount) return res.status(404).json({ detail: "faskes tidak ditemukan" });
    // evidence_ref otomatis dari flag klaim faskes ini
    const fl = await pool.query(
      "SELECT claim_id FROM claim_flag WHERE provider = $1", [kode]);
    const ev: string[] = fl.rows.map((r: { claim_id: string }) => r.claim_id);
    const { rows } = await pool.query(`
      INSERT INTO audit_outcome (provider, period, verdict, evidence_ref, auditor_notes, sample_kind)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, provider AS kode, period, verdict, auditor_notes, sample_kind, decided_at`,
      [kode, b.period ?? String(new Date().toISOString().slice(0, 7)), verdict, ev, notes, sample_kind]);
    res.status(201).json(rows[0]);
  }));

  // POST /api/klaim — input satu klaim rawat inap, langsung diskor terhadap
  // baseline pembanding siklus berjalan (fallback hierarkis fine → CBG →
  // global, kelebihan dipotong di nol). Peringkat faskes diperbarui saat
  // itu juga. Baseline penuh tetap bulanan.
  app.post("/api/klaim", ah(async (req, res) => {
    const b = req.body ?? {};
    const provider = b.provider, cbg = b.cbg;
    if (typeof provider !== "string" || !provider || typeof cbg !== "string" || !cbg)
      return res.status(422).json({ detail: "provider dan cbg wajib string tidak kosong" });
    const admission_dt = b.admission_dt, discharge_dt = b.discharge_dt;
    for (const d of [admission_dt, discharge_dt])
      if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d)))
        return res.status(422).json({ detail: "tanggal harus format YYYY-MM-DD" });
    const amount = b.amount, umur = b.umur;
    if (!Number.isInteger(amount) || amount <= 0)
      return res.status(422).json({ detail: "amount wajib integer > 0" });
    if (!Number.isInteger(umur) || umur < 0 || umur > 120)
      return res.status(422).json({ detail: "umur wajib integer 0-120" });
    const n_kronis = b.n_kronis ?? 0;
    if (!Number.isInteger(n_kronis) || n_kronis < 0 || n_kronis > 11)
      return res.status(422).json({ detail: "n_kronis wajib integer 0-11" });
    const dx: string[] = Array.isArray(b.dx)
      ? b.dx.filter((d: unknown) => typeof d === "string" && d) : [];
    if (b.dx !== undefined && !Array.isArray(b.dx))
      return res.status(422).json({ detail: "dx wajib array of string" });
    if (dx.length > 10) return res.status(422).json({ detail: "maksimal 10 kode diagnosis" });

    const los = Math.round((Date.parse(discharge_dt) - Date.parse(admission_dt)) / 86400000);
    if (los < 1)
      return res.status(400).json({ detail: "tanggal pulang harus setelah tanggal masuk" });

    const ex0 = await pool.query("SELECT 1 FROM faskes_scores WHERE provider = $1", [provider]);
    if (!ex0.rowCount) return res.status(404).json({ detail: "faskes tidak ditemukan" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // baseline LOS — hierarki region-aware (engine/run_db.py versi d76606f):
      // parent chain region → cbg → cbg×region (shrinkage w=n/(n+k), k=10),
      // lalu fine cbg×umur×komorbid×region×kelas bila group >= k.
      const ageband = umur < 1 ? null : umur <= 40 ? 0 : umur <= 60 ? 1 : umur <= 75 ? 2 : 3;
      const comorbband = n_kronis <= 1 ? 0 : n_kronis <= 3 ? 1 : n_kronis <= 5 ? 2 : 3;
      const SHRINK_K = 10;
      const statsSql = (where: string, params: unknown[]) => client.query(`
        SELECT COUNT(*)::int AS n,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ${LOS_EXPR}) AS med,
               percentile_cont(0.9) WITHIN GROUP (ORDER BY ${LOS_EXPR}) AS p90
        ${BASE_FROM} AND ${where}`, params);
      const fk = await client.query(
        "SELECT region::int AS region, kelas_rs FROM faskes WHERE provider = $1",
        [provider]);
      const faskesCtx = fk.rows[0] ?? { region: null, kelas_rs: null };

      // parent: region → (blend cbg → cbg×region)
      let g0 = await statsSql("TRUE", []);
      let peer_med = Number(g0.rows[0].med), peer_p90 = Number(g0.rows[0].p90);
      if (faskesCtx.region !== null) {
        const rr = await statsSql("k.region = $1", [faskesCtx.region]);
        if (rr.rows[0] && rr.rows[0].med !== null) {
          peer_med = Number(rr.rows[0].med); peer_p90 = Number(rr.rows[0].p90);
        }
      }
      const dxr = await statsSql("k.cbg = $1", [cbg]);
      if (dxr.rows[0].med !== null) {
        const w = dxr.rows[0].n / (dxr.rows[0].n + SHRINK_K);
        peer_med = w * Number(dxr.rows[0].med) + (1 - w) * peer_med;
        peer_p90 = w * Number(dxr.rows[0].p90) + (1 - w) * peer_p90;
      }
      let fallback = "parent";
      if (faskesCtx.region !== null) {
        const dr = await statsSql("k.cbg = $1 AND k.region = $2",
          [cbg, faskesCtx.region]);
        if (dr.rows[0].med !== null) {
          const w = dr.rows[0].n / (dr.rows[0].n + SHRINK_K);
          peer_med = w * Number(dr.rows[0].med) + (1 - w) * peer_med;
          peer_p90 = w * Number(dr.rows[0].p90) + (1 - w) * peer_p90;
          if (dr.rows[0].n >= SHRINK_K) fallback = "dx_region";
        }
      }
      // fine group (region-aware) — bila ada, GANTI parent chain
      // (semantik sama dengan api/main.py: return fine blend, bukan gabungan)
      if (faskesCtx.region !== null && faskesCtx.kelas_rs) {
        const fr = await statsSql(
          `k.cbg = $1 AND ${AGE_EXPR} = $2 AND ${COM_EXPR} = $3 AND k.region = $4 AND k.kelas_rs = $5`,
          [cbg, ageband, comorbband, faskesCtx.region, faskesCtx.kelas_rs]);
        if (fr.rows[0].med !== null && fr.rows[0].n >= SHRINK_K) {
          const w = fr.rows[0].n / (fr.rows[0].n + SHRINK_K);
          peer_med = w * Number(fr.rows[0].med) + (1 - w) * peer_med;
          peer_p90 = w * Number(fr.rows[0].p90) + (1 - w) * peer_p90;
          fallback = "fine";
        }
      }
      const excess = Math.max(los - peer_med, 0);
      const outlier = los > peer_p90 ? 1 : 0;
      const rugi = excess * (amount / los);

      // sinyal upcoding
      const admit_dx = typeof b.admit_dx === "string" && b.admit_dx ? b.admit_dx : null;
      const dx_change = admit_dx && !dx.includes(admit_dx) ? 1 : 0;
      // proc band: none/operatif/intervensi (ICD-9-CM: tanpa proc / < 8700 /
      // 8700-9999) — cegah campuran operasi/intervensi vs konsultasi dalam
      // satu peer group (temuan data riil BPJS 2025). Tidak ada kolom
      // proc_band di DB; dihitung dari proc1-6 di SQL.
      const PROC_BAND_EXPR = `CASE WHEN regexp_replace(
          COALESCE(proc1,proc2,proc3,proc4,proc5,proc6), '\\D.*', '') !~ '^[0-9]+$'
        THEN 'none'
        WHEN regexp_replace(COALESCE(proc1,proc2,proc3,proc4,proc5,proc6),
          '\\D.*', '')::int < 8700
        THEN 'operatif' ELSE 'intervensi' END`;
      const req_proc = Array.isArray(b.proc) ? b.proc.filter(Boolean) : [];
      const proc_band = req_proc.length === 0 ? "none"
        : req_proc.some((p: string) => {
            const m = /^\s*(\d+)/.exec(p);
            return m && Number(m[1]) < 8700;
          }) ? "operatif" : "intervensi";
      const peer_key = admit_dx || dx[0] || null;
      let amt_ratio: number | null = null;
      let peer_level: string | null = null;
      if (peer_key) {
        let r2 = await client.query(`
          SELECT COUNT(*)::int AS n,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS med
          FROM klaim_rawat_inap WHERE COALESCE(admit_dx, dx1) = $1
            AND ${PROC_BAND_EXPR} = $2`, [peer_key, proc_band]);
        if (!(r2.rows[0].n >= 10 && r2.rows[0].med)) {
          r2 = await client.query(`
            SELECT COUNT(*)::int AS n,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS med
            FROM klaim_rawat_inap WHERE ${PROC_BAND_EXPR} = $1`, [proc_band]);
        }
        peer_level = r2.rows[0].n >= 10 ? "dx" : "setting_global";
        if (r2.rows[0].med) amt_ratio = amount / r2.rows[0].med;
      }

      const m = await client.query(
        "SELECT MAX(substring(claim_id from 4)::bigint)::float8 AS max FROM claim_evidence");
      const claim_id = `CLM${String((Number(m.rows[0].max) || 0) + 1).padStart(9, "0")}`;
      const bene_id = (typeof b.bene_id === "string" && b.bene_id) ||
        `PESDEMO${String(los).padStart(2, "0")}${String(umur).padStart(3, "0")}`;
      const dx10 = Array.from({ length: 10 }, (_, i) => dx[i] ?? null);
      const proc6 = Array.from({ length: 6 }, (_, i) => req_proc[i] ?? null);

      await client.query(`
        INSERT INTO klaim_rawat_inap
          (claim_id, bene_id, provider, claim_start, claim_end,
           admission_dt, discharge_dt, amount, admit_dx, cbg,
           dx1, dx2, dx3, dx4, dx5, dx6, dx7, dx8, dx9, dx10,
           proc1, proc2, proc3, proc4, proc5, proc6)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26)`,
        [claim_id, bene_id, provider, admission_dt, discharge_dt,
         admission_dt, discharge_dt, amount, admit_dx, cbg, ...dx10, ...proc6]);
      await client.query(`
        INSERT INTO claim_evidence
          (claim_id, provider, cbg, umur, los, peer_median, peer_p90,
           excess, outlier, fallback, rugi, setting, dx_change, n_dx,
           amt, amt_ratio, peer_level)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'inpatient',$12,$13,$14,$15,$16)`,
        [claim_id, provider, cbg, umur, los, peer_med, peer_p90,
         excess, outlier, fallback, rugi, dx_change, dx.length, amount, amt_ratio, peer_level]);

      await refreshScores(client, provider);
      await client.query("COMMIT");

      const f = await client.query(`
        SELECT peringkat::int AS peringkat, skor_gabungan::float8,
               skor_los::float8, skor_upcoding::float8
        FROM faskes_scores WHERE provider = $1`, [provider]);
      res.json({
        claim_id, setting: "inpatient", cbg, umur, los,
        peer_median: peer_med, peer_p90, fallback, excess, outlier, rugi,
        dx_change, n_dx: dx.length, amt_ratio, faskes: f.rows[0],
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }));

  // -------------------------------------------------------------------------
  // Statis — build React (dist/public)
  // -------------------------------------------------------------------------
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
