/**
 * Orbital Dynamics Corp — Demo Seed Script
 *
 * Populates a realistic satellite-operator dataset for demo and functional
 * testing purposes (PLT-020).
 *
 * Entities:
 *   ODC-US  — Orbital Dynamics Corp (US HQ, USD)
 *   ODC-EU  — Orbital Dynamics Europe GmbH (DE, EUR)
 *   ODC-APAC — Orbital Dynamics Asia Pacific Pte. Ltd. (SG, SGD)
 *
 * Covers:
 *   - 3 legal entities
 *   - 5 satellites (3 GEO, 2 LEO) as products with ext.asset_type
 *   - 4 ground stations as inventory locations
 *   - 20+ customers (including Ukraine & Israel)
 *   - 15+ vendors (launch providers, components, services)
 *   - Open sales orders with mixed compliance status
 *   - Capacity contracts (sales orders with ext.order_type = 'CAPACITY')
 *   - CRM pipeline: pipeline stages + opportunities
 *   - Chart of accounts, fiscal year/periods, posted journal entries
 *   - Trial balance that reconciles to zero
 *   - Demo user: demo@apogee.dev / apogee-demo
 *
 * Idempotent: all inserts use ON CONFLICT DO NOTHING with deterministic UUIDs.
 * Target runtime: < 30 seconds.
 *
 * Usage:
 *   bun run src/seed.ts
 *
 * Ref: FEAT-009 PLT-020, issue erp-7326cf27
 */

import pg from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL ??
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/apogee";

// ─── Deterministic UUIDs ──────────────────────────────────────────────────────
// Prefix notation: first nibble indicates category.
// All seeded rows use these IDs for idempotency (ON CONFLICT DO NOTHING).

const SYS = "00000000-0000-0000-0000-000000000001"; // system user from migration

// Entities
const E_US = "a0000000-0000-0000-0000-000000000001";
const E_EU = "a0000000-0000-0000-0000-000000000002";
const E_APAC = "a0000000-0000-0000-0000-000000000003";

// Demo user
const U_DEMO = "a1000000-0000-0000-0000-000000000001";

// Roles (reuse system roles from migration)
const ROLE_ADMIN = "20000000-0000-0000-0000-000000000001";

// ITAR compartments
const COMP_GEO = "a0100000-0000-0000-0000-000000000001";
const COMP_LEO = "a0100000-0000-0000-0000-000000000002";

// Currencies (ILS and UAH not in migration — added here)
// Accounts
const acct = (n: number) => `a8${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;

// Fiscal
const FY_US = "a5000000-0000-0000-0000-000000000001";
const FP = (n: number) => `a5000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Products / satellites
const PROD = (n: number) => `a4${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;

// Locations (ground stations)
const LOC = (n: number) => `a4900000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Vendors
const VEN = (n: number) => `a3${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;

// Customers
const CUS = (n: number) => `a2${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;

// Customer addresses
const CADR = (n: number) => `a2${String(n).padStart(6, "0")}-0000-0000-0000-000000000002`;

// Orders / quotes
const SO = (n: number) => `a6${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;
const SOL = (so: number, line: number) =>
	`a6${String(so).padStart(6, "0")}-0000-0000-0000-${String(line).padStart(12, "0")}`;
const PO_ID = (n: number) => `a6900000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const POL_ID = (po: number, line: number) =>
	`a6${String(900000 + po).padStart(6, "0")}-0000-0000-${String(line).padStart(4, "0")}-000000000001`;

// Journal entries
const JE = (n: number) => `a9${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;
const JEL = (je: number, line: number) =>
	`a9${String(je).padStart(6, "0")}-0000-0000-0000-${String(line).padStart(12, "0")}`;

// CRM
const CRMC = (n: number) => `a7${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;
const CRMCT = (n: number) => `a7${String(n).padStart(6, "0")}-0000-0000-0000-000000000002`;
const STAGE = (n: number) => `a7900000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const OPP = (n: number) => `a7800000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Screening
const SL_SDN = "a0200000-0000-0000-0000-000000000001";
const SLE_CRIMEA = "a0200000-0000-0000-0000-000000000002";

// Compliance holds
const HOLD = (n: number) => `a0300000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// ─── PLT-022: Compliance and financial scenario IDs ───────────────────────────
// EU entity fiscal helpers (intercompany transactions)
const FY_EU = "b5000000-0000-0000-0000-000000000001";
const FP_EU = (n: number) => `b5000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const acctEU = (n: number) => `b8${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;

// SDN screening entry for denied-party scenario
const SLE_IRAN = "a0200000-0000-0000-0000-000000000003";
const SR_IRAN = "b0100000-0000-0000-0000-000000000001";

// Quote (unclassified item scenario)
const QT1 = "b6100000-0000-0000-0000-000000000001";
const QT1L1 = "b6100000-0000-0000-0000-000000000002";

// Customer invoices — AR aging
const CI = (n: number) => `c1${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;
const CIL = (n: number) => `c1${String(n).padStart(6, "0")}-0000-0000-0000-000000000002`;

// Vendor bills — AP aging, milestone payments, three-way match
const VB = (n: number) => `c2${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;
const VBL = (n: number) => `c2${String(n).padStart(6, "0")}-0000-0000-0000-000000000002`;

// Inventory items
const ITEM = (n: number) => `c3${String(n).padStart(6, "0")}-0000-0000-0000-000000000001`;

// Lots and serial numbers
const LOT1 = "c4000000-0000-0000-0000-000000000001";
const SER = (n: number) => `c4100000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Goods receipts
const GR1 = "c5000000-0000-0000-0000-000000000001";
const GRL1 = "c5000000-0000-0000-0000-000000000002";

// Intercompany agreement and transaction
const ICA1 = "b7000000-0000-0000-0000-000000000001";
const ICT1 = "b7000000-0000-0000-0000-000000000002";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function run(db: pg.PoolClient, sql: string, params: unknown[] = []) {
	await db.query(sql, params);
}

/** Set transaction-local audit context (required by audit_stamp trigger). */
async function audit(db: pg.PoolClient, entityId: string) {
	await db.query(
		`SELECT set_config('app.actor_id',    $1, TRUE),
		        set_config('app.actor_email', $2, TRUE),
		        set_config('app.entity_id',   $3, TRUE)`,
		[SYS, "system@apogee.internal", entityId],
	);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function seed() {
	const db = await pool.connect();
	try {
		await db.query("BEGIN");

		// ── 0. Extra currencies ────────────────────────────────────────────────
		await run(
			db,
			`INSERT INTO currency (code, name, symbol, decimal_places) VALUES
			 ('ILS', 'Israeli New Shekel', '₪', 2),
			 ('UAH', 'Ukrainian Hryvnia',  '₴', 2),
			 ('AED', 'UAE Dirham',         'د.إ', 2),
			 ('KRW', 'South Korean Won',   '₩', 0)
			 ON CONFLICT (code) DO NOTHING`,
		);

		// ── 1. Legal entities ──────────────────────────────────────────────────
		// Must run in a transaction with app.actor_id set.
		// legal_entity has an AFTER audit trigger, so actor context must be set.
		await audit(db, E_US);
		await run(
			db,
			`INSERT INTO user_account (id, email, display_name, is_active, created_by, updated_by)
			 VALUES ($1, 'demo@apogee.dev', 'Demo User', TRUE, $2, $2)
			 ON CONFLICT (id) DO NOTHING`,
			[U_DEMO, SYS],
		);
		// Also upsert by email in case ID differs
		await run(
			db,
			`INSERT INTO user_account (id, email, display_name, is_active, created_by, updated_by)
			 VALUES ($1, 'demo@apogee.dev', 'Demo User', TRUE, $2, $2)
			 ON CONFLICT (email) DO NOTHING`,
			[U_DEMO, SYS],
		);

		await run(
			db,
			`INSERT INTO legal_entity
			   (id, code, name, country_code, base_currency_code, tax_id, created_by, updated_by)
			 VALUES
			   ($1, 'ODC-US',   'Orbital Dynamics Corp',                  'US', 'USD', '47-1234567',  $4, $4),
			   ($2, 'ODC-EU',   'Orbital Dynamics Europe GmbH',           'DE', 'EUR', 'DE298765432', $4, $4),
			   ($3, 'ODC-APAC', 'Orbital Dynamics Asia Pacific Pte. Ltd.','SG', 'SGD', '202312345A',  $4, $4)
			 ON CONFLICT (id) DO NOTHING`,
			[E_US, E_EU, E_APAC, SYS],
		);

		// EU and APAC are subsidiaries of US
		await run(
			db,
			`UPDATE legal_entity SET parent_entity_id = $1
			 WHERE id IN ($2, $3) AND parent_entity_id IS NULL`,
			[E_US, E_EU, E_APAC],
		);

		// Demo user global admin role
		await run(
			db,
			`INSERT INTO user_role (user_id, role_id, granted_by)
			 VALUES ($1, $2, $3)
			 ON CONFLICT DO NOTHING`,
			[U_DEMO, ROLE_ADMIN, SYS],
		);

		// Demo user gets access to all 3 ODC entities; US is default
		for (const [entityId, isDefault] of [
			[E_US, true],
			[E_EU, false],
			[E_APAC, false],
		] as [string, boolean][]) {
			await run(
				db,
				`INSERT INTO user_entity_access (user_id, entity_id, is_default, granted_by)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (user_id, entity_id) DO NOTHING`,
				[U_DEMO, entityId, isDefault, SYS],
			);
		}

		// ── 2. ITAR compartments ───────────────────────────────────────────────
		await run(
			db,
			`INSERT INTO itar_compartment
			   (id, code, name, classification_level, created_by, updated_by)
			 VALUES
			   ($1, 'GEO-SAT',  'GEO Satellite Programs',    'CONTROLLED', $3, $3),
			   ($2, 'LEO-CONS', 'LEO Constellation Programs', 'CONTROLLED', $3, $3)
			 ON CONFLICT (id) DO NOTHING`,
			[COMP_GEO, COMP_LEO, SYS],
		);

		// ── 3. Chart of accounts (US entity) ──────────────────────────────────
		await audit(db, E_US);

		const accounts: [string, string, string, string, string, boolean][] = [
			// id, number, name, type, normal_balance, is_header
			[acct(1000), "1000", "Assets", "ASSET", "DEBIT", true],
			[acct(1100), "1100", "Cash and Cash Equivalents", "ASSET", "DEBIT", false],
			[acct(1200), "1200", "Accounts Receivable", "ASSET", "DEBIT", false],
			[acct(1300), "1300", "Inventory", "ASSET", "DEBIT", false],
			[acct(1400), "1400", "Prepaid Expenses", "ASSET", "DEBIT", false],
			[acct(1500), "1500", "Property and Equipment", "ASSET", "DEBIT", false],
			[acct(2000), "2000", "Liabilities", "LIABILITY", "CREDIT", true],
			[acct(2100), "2100", "Accounts Payable", "LIABILITY", "CREDIT", false],
			[acct(2200), "2200", "Accrued Liabilities", "LIABILITY", "CREDIT", false],
			[acct(2300), "2300", "Deferred Revenue", "LIABILITY", "CREDIT", false],
			[acct(3000), "3000", "Equity", "EQUITY", "CREDIT", true],
			[acct(3100), "3100", "Retained Earnings", "EQUITY", "CREDIT", false],
			[acct(3200), "3200", "Common Stock", "EQUITY", "CREDIT", false],
			[acct(4000), "4000", "Revenue", "REVENUE", "CREDIT", true],
			[acct(4100), "4100", "Satellite Capacity Revenue", "REVENUE", "CREDIT", false],
			[acct(4200), "4200", "Ground Services Revenue", "REVENUE", "CREDIT", false],
			[acct(4300), "4300", "Hardware Sales Revenue", "REVENUE", "CREDIT", false],
			[acct(5000), "5000", "Expenses", "EXPENSE", "DEBIT", true],
			[acct(5100), "5100", "Cost of Services", "EXPENSE", "DEBIT", false],
			[acct(5200), "5200", "Salaries and Benefits", "EXPENSE", "DEBIT", false],
			[acct(5300), "5300", "Launch and Operations Expense", "EXPENSE", "DEBIT", false],
			[acct(5400), "5400", "Travel and Entertainment", "EXPENSE", "DEBIT", false],
			[acct(5500), "5500", "Depreciation Expense", "EXPENSE", "DEBIT", false],
		];

		for (const [id, num, name, type, nb, isHeader] of accounts) {
			await run(
				db,
				`INSERT INTO account
				   (id, entity_id, account_number, name, account_type, normal_balance, is_header, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
				 ON CONFLICT (entity_id, account_number) DO NOTHING`,
				[id, E_US, num, name, type, nb, isHeader, SYS],
			);
		}

		// ── 4. Fiscal year and periods (US entity, FY2026) ────────────────────
		await audit(db, E_US);
		await run(
			db,
			`INSERT INTO fiscal_year (id, entity_id, year_label, start_date, end_date, created_by, updated_by)
			 VALUES ($1, $2, 'FY2026', '2026-01-01', '2026-12-31', $3, $3)
			 ON CONFLICT (entity_id, year_label) DO NOTHING`,
			[FY_US, E_US, SYS],
		);

		const months = [
			["Jan", "01-01", "01-31"],
			["Feb", "02-01", "02-28"],
			["Mar", "03-01", "03-31"],
			["Apr", "04-01", "04-30"],
			["May", "05-01", "05-31"],
			["Jun", "06-01", "06-30"],
			["Jul", "07-01", "07-31"],
			["Aug", "08-01", "08-31"],
			["Sep", "09-01", "09-30"],
			["Oct", "10-01", "10-31"],
			["Nov", "11-01", "11-30"],
			["Dec", "12-01", "12-31"],
		];

		for (let i = 0; i < months.length; i++) {
			const month = months[i];
			if (!month) continue;
			const [label, start, end] = month;
			const periodNum = i + 1;
			// Periods 1-2 are HARD_CLOSED, period 3 is SOFT_CLOSED (month-end in progress),
			// period 4 is OPEN, rest are FUTURE
			const status =
				periodNum <= 2
					? "HARD_CLOSED"
					: periodNum === 3
						? "SOFT_CLOSED"
						: periodNum === 4
							? "OPEN"
							: "FUTURE";
			await run(
				db,
				`INSERT INTO fiscal_period
				   (id, fiscal_year_id, entity_id, period_number, period_label, start_date, end_date, status, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
				 ON CONFLICT (fiscal_year_id, period_number) DO NOTHING`,
				[
					FP(periodNum),
					FY_US,
					E_US,
					periodNum,
					`2026-${label}`,
					`2026-${start}`,
					`2026-${end}`,
					status,
					SYS,
				],
			);
		}

		// ── 5. Products: 5 satellites + ground equipment ──────────────────────
		await audit(db, E_US);

		const satellites: [string, string, string, string, string | null][] = [
			[
				PROD(1),
				"SAT-GEO-001",
				"APEX-1 (GEO Communications)",
				"GEO geostationary broadband satellite at 85°E",
				COMP_GEO,
			],
			[PROD(2), "SAT-GEO-002", "APEX-2 (GEO Video)", "GEO broadcast satellite at 101°E", COMP_GEO],
			[
				PROD(3),
				"SAT-GEO-003",
				"APEX-3 (GEO Maritime)",
				"GEO maritime VSAT satellite at 57°E",
				COMP_GEO,
			],
			[
				PROD(4),
				"SAT-LEO-001",
				"ORBIT-1 (LEO Constellation Bus A)",
				"LEO broadband constellation satellite — bus A",
				COMP_LEO,
			],
			[
				PROD(5),
				"SAT-LEO-002",
				"ORBIT-2 (LEO Constellation Bus B)",
				"LEO broadband constellation satellite — bus B",
				COMP_LEO,
			],
		];

		for (const [id, code, name, desc, compartId] of satellites) {
			await run(
				db,
				`INSERT INTO product
				   (id, entity_id, product_code, name, description, product_type, unit_of_measure,
				    itar_compartment_id, ext, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, 'SERVICE', 'EA', $6,
				         '{"asset_type":"satellite","orbit_class":"' || (CASE WHEN $3 LIKE '%GEO%' THEN 'GEO' ELSE 'LEO' END) || '"}'::jsonb,
				         $7, $7)
				 ON CONFLICT (entity_id, product_code) DO NOTHING`,
				[id, E_US, code, name, desc, compartId, SYS],
			);
		}

		// Ground equipment product (for hardware sales)
		await run(
			db,
			`INSERT INTO product
			   (id, entity_id, product_code, name, description, product_type, unit_of_measure, created_by, updated_by)
			 VALUES ($1, $2, 'VSAT-TERM', 'VSAT Terminal Kit', 'Ku-band VSAT terminal with installation kit', 'GOOD', 'EA', $3, $3)
			 ON CONFLICT (entity_id, product_code) DO NOTHING`,
			[PROD(6), E_US, SYS],
		);

		await run(
			db,
			`INSERT INTO product
			   (id, entity_id, product_code, name, description, product_type, unit_of_measure, created_by, updated_by)
			 VALUES ($1, $2, 'GND-SVC', 'Ground Station Operations Service', 'Monthly managed ground station operations', 'SUBSCRIPTION', 'MONTH', $3, $3)
			 ON CONFLICT (entity_id, product_code) DO NOTHING`,
			[PROD(7), E_US, SYS],
		);

		// ── 6. Ground stations as inventory locations ─────────────────────────
		await audit(db, E_US);

		const groundStations: [string, string, string, object][] = [
			[
				LOC(1),
				"GS-VIRGINIA",
				"Culpeper Ground Station (VA, USA)",
				{
					country_code: "US",
					region: "Virginia",
					lat: 38.47,
					lon: -77.99,
					asset_type: "ground_station",
				},
			],
			[
				LOC(2),
				"GS-HAWAII",
				"Kaena Point Ground Station (HI, USA)",
				{
					country_code: "US",
					region: "Hawaii",
					lat: 21.57,
					lon: -158.25,
					asset_type: "ground_station",
				},
			],
			[
				LOC(3),
				"GS-AMSTERDAM",
				"Amsterdam Ground Station (Netherlands)",
				{
					country_code: "NL",
					region: "North Holland",
					lat: 52.37,
					lon: 4.9,
					asset_type: "ground_station",
				},
			],
			[
				LOC(4),
				"GS-SINGAPORE",
				"Singapore Ground Station (Buona Vista)",
				{
					country_code: "SG",
					region: "Singapore",
					lat: 1.31,
					lon: 103.79,
					asset_type: "ground_station",
				},
			],
		];

		for (const [id, code, name, address] of groundStations) {
			await run(
				db,
				`INSERT INTO inventory_location
				   (id, entity_id, location_code, name, address, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $6)
				 ON CONFLICT (entity_id, location_code) DO NOTHING`,
				[id, E_US, code, name, JSON.stringify(address), SYS],
			);
		}

		// ── 7. Customers (20+ with geographic diversity) ──────────────────────
		await audit(db, E_US);

		interface CustomerDef {
			id: string;
			code: string;
			name: string;
			country: string;
			currency: string;
			notes?: string;
			ext?: object;
		}

		const customers: CustomerDef[] = [
			// Cleared customers
			{
				id: CUS(1),
				code: "APEX-BCAST",
				name: "Apex Broadcasting Group",
				country: "US",
				currency: "USD",
			},
			{
				id: CUS(2),
				code: "EUROSAT-TV",
				name: "EuroSat Television GmbH",
				country: "DE",
				currency: "EUR",
			},
			{
				id: CUS(3),
				code: "ASIALINK",
				name: "AsiaLink Communications Pte.",
				country: "SG",
				currency: "SGD",
			},
			{
				id: CUS(4),
				code: "NORDIC-NET",
				name: "Nordic Satellite Network AS",
				country: "NO",
				currency: "EUR",
			},
			{ id: CUS(5), code: "AUSVSAT", name: "AustraliaSat Pty Ltd", country: "AU", currency: "AUD" },
			{
				id: CUS(6),
				code: "BRZTELECOM",
				name: "Brazil Telecom S.A.",
				country: "BR",
				currency: "USD",
			},
			{
				id: CUS(7),
				code: "CANSPACE",
				name: "Canadian Space Authority",
				country: "CA",
				currency: "CAD",
			},
			{ id: CUS(8), code: "JP-SKYNET", name: "Japan SkyNet K.K.", country: "JP", currency: "JPY" },
			{
				id: CUS(9),
				code: "KR-SATCOM",
				name: "Korea Satellite Communications Inc.",
				country: "KR",
				currency: "KRW",
			},
			{
				id: CUS(10),
				code: "UK-VSAT",
				name: "UK VSAT Solutions Ltd.",
				country: "GB",
				currency: "GBP",
			},
			{
				id: CUS(11),
				code: "SWISSLINK",
				name: "SwissLink Satellite AG",
				country: "CH",
				currency: "CHF",
			},
			{
				id: CUS(12),
				code: "INDOSAT-SC",
				name: "IndoSat Space Communications",
				country: "ID",
				currency: "USD",
			},
			{
				id: CUS(13),
				code: "NZ-ORBITAL",
				name: "New Zealand Orbital Ltd.",
				country: "NZ",
				currency: "USD",
			},
			{
				id: CUS(14),
				code: "AFRICA-SAT",
				name: "AfricaSat Broadband (Pty) Ltd",
				country: "ZA",
				currency: "USD",
			},
			{
				id: CUS(15),
				code: "UAE-SKYCOM",
				name: "UAE Sky Communications LLC",
				country: "AE",
				currency: "AED",
			},
			// Compliance-sensitive customers
			{
				id: CUS(16),
				code: "IL-SKYTEL",
				name: "Israel SkyTel Ltd.",
				country: "IL",
				currency: "ILS",
				notes: "LEO terminal order cleared by export control — EAR99 hardware, no license required",
			},
			{
				id: CUS(17),
				code: "UA-SATNET",
				name: "Ukraine SatNet LLC",
				country: "UA",
				currency: "UAH",
				notes: "Kiev-based legitimate operator; Crimea-region terminals require manual review",
			},
			{
				id: CUS(18),
				code: "UA-CRIMEA",
				name: "Black Sea Satellite Services LLC",
				country: "UA",
				currency: "UAH",
				notes:
					"Billing address in Simferopol — order on compliance hold (Crimea restricted region)",
				ext: { compliance_flag: "CRIMEA_REGION", hold_reason: "AMBIGUOUS_REGION" },
			},
			{
				id: CUS(19),
				code: "IR-TELECOM",
				name: "Iranian Space Research Institute",
				country: "IR",
				currency: "USD",
				notes: "Embargoed — all orders require denial or Treasury/BIS license",
				ext: { compliance_flag: "EMBARGOED_COUNTRY" },
			},
			{
				id: CUS(20),
				code: "MX-VSAT",
				name: "Mexico VSAT Servicios S.A.",
				country: "MX",
				currency: "USD",
			},
			{
				id: CUS(21),
				code: "CL-ESPACIO",
				name: "Chile Espacio SPA",
				country: "CL",
				currency: "USD",
			},
			{
				id: CUS(22),
				code: "NG-SATCOM",
				name: "Nigerian Satcom Ltd.",
				country: "NG",
				currency: "USD",
			},
		];

		for (const c of customers) {
			await run(
				db,
				`INSERT INTO customer
				   (id, entity_id, customer_code, legal_name, country_code, default_currency_code, notes, ext, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
				 ON CONFLICT (entity_id, customer_code) DO NOTHING`,
				[
					c.id,
					E_US,
					c.code,
					c.name,
					c.country,
					c.currency,
					c.notes ?? null,
					JSON.stringify(c.ext ?? {}),
					SYS,
				],
			);
		}

		// Customer addresses for compliance scenario customers
		const customerAddresses = [
			[CADR(16), CUS(16), "SHIPPING", "12 HaSadna St", null, "Haifa", "HA", "3508001", "IL"],
			[CADR(17), CUS(17), "SHIPPING", "14 Khreshchatyk St", null, "Kyiv", null, "01001", "UA"],
			[CADR(18), CUS(18), "SHIPPING", "21 Kirov St", null, "Simferopol", "Crimea", "95000", "UA"],
		];
		for (const [id, custId, type, l1, l2, city, state, postal, cc] of customerAddresses) {
			await run(
				db,
				`INSERT INTO customer_address
				   (id, customer_id, address_type, address_line_1, address_line_2, city, state_province, postal_code, country_code, is_default, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $10)
				 ON CONFLICT (id) DO NOTHING`,
				[id, custId, type, l1, l2, city, state, postal, cc, SYS],
			);
		}

		// ── 8. Vendors (15+) ──────────────────────────────────────────────────
		await audit(db, E_US);

		const vendors: [string, string, string, string, string][] = [
			// Launch providers
			[VEN(1), "SPACELIFT", "SpaceLift Inc.", "US", "USD"],
			[VEN(2), "ARIANE-GRP", "Ariane Group SAS", "FR", "EUR"],
			[VEN(3), "ROCKET-LAB", "Rocket Lab USA Inc.", "US", "USD"],
			// Satellite manufacturers
			[VEN(4), "ASTROCRAFT", "AstroCraft Systems Ltd.", "GB", "GBP"],
			[VEN(5), "SATEL-MFG", "Satellite Manufacturing Corp.", "US", "USD"],
			[VEN(6), "NIPPON-SAT", "Nippon Satellite Technologies K.K.", "JP", "JPY"],
			// Component suppliers
			[VEN(7), "SOLAR-TECH", "SolarTech Power Systems GmbH", "DE", "EUR"],
			[VEN(8), "RADCOMM", "RadComm Transponder Systems", "US", "USD"],
			[VEN(9), "ORBIT-CTRL", "Orbital Control Electronics Inc.", "US", "USD"],
			[VEN(10), "KYOTEK", "Kyotek Composite Materials Ltd.", "JP", "JPY"],
			// Ground systems
			[VEN(11), "SATMODEM", "SatModem Solutions LLC", "US", "USD"],
			[VEN(12), "ANTENNA-SYS", "Antenna Systems Europe B.V.", "NL", "EUR"],
			// Services
			[VEN(13), "FREQ-CLEAR", "Frequency Clearance Consultants", "US", "USD"],
			[VEN(14), "ORBIT-INS", "Orbital Insurance Underwriters Ltd.", "GB", "GBP"],
			[VEN(15), "LAUNCH-SVC", "Launch Operations Services Corp.", "US", "USD"],
			[VEN(16), "ITU-FILING", "ITU Filing Services Ltd.", "CH", "CHF"],
		];

		for (const [id, code, name, country, currency] of vendors) {
			await run(
				db,
				`INSERT INTO vendor
				   (id, entity_id, vendor_code, legal_name, country_code, default_currency_code, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
				 ON CONFLICT (entity_id, vendor_code) DO NOTHING`,
				[id, E_US, code, name, country, currency, SYS],
			);
		}

		// ── 9. Screening list and compliance data ─────────────────────────────
		await audit(db, E_US);

		await run(
			db,
			`INSERT INTO screening_list (id, code, name, source_authority, created_by)
			 VALUES ($1, 'SDN', 'OFAC Specially Designated Nationals', 'OFAC/US Treasury', $2)
			 ON CONFLICT (code) DO NOTHING`,
			[SL_SDN, SYS],
		);

		await run(
			db,
			`INSERT INTO screening_list_entry
			   (id, screening_list_id, entry_name, country_codes, remarks, listed_date)
			 VALUES ($1, $2, 'Black Sea Satellite Services LLC', ARRAY['UA'], 'Crimea-based entity, sanctions applicable', '2022-03-15')
			 ON CONFLICT (id) DO NOTHING`,
			[SLE_CRIMEA, SL_SDN],
		);

		// Country restriction for embargoed countries
		await run(
			db,
			`INSERT INTO country_restriction (id, entity_id, name, description, created_by, updated_by)
			 VALUES ($1, $2, 'ITAR/EAR Embargo List', 'Countries subject to US export embargo per ITAR/EAR', $3, $3)
			 ON CONFLICT (id) DO NOTHING`,
			["a0400000-0000-0000-0000-000000000001", E_US, SYS],
		);

		await run(
			db,
			`INSERT INTO country_restriction_rule
			   (id, country_restriction_id, country_code, restriction_type, effective_from, notes, created_by)
			 VALUES
			   ('a0400000-0000-0000-0000-000000000002', 'a0400000-0000-0000-0000-000000000001', 'IR', 'EMBARGOED', '2010-01-01', 'OFAC/ITAR full embargo', $1),
			   ('a0400000-0000-0000-0000-000000000003', 'a0400000-0000-0000-0000-000000000001', 'CU', 'EMBARGOED', '1990-01-01', 'OFAC Cuba embargo', $1),
			   ('a0400000-0000-0000-0000-000000000004', 'a0400000-0000-0000-0000-000000000001', 'SY', 'EMBARGOED', '2011-08-01', 'OFAC Syria sanctions', $1)
			 ON CONFLICT (country_restriction_id, country_code, classification_type, effective_from) DO NOTHING`,
			[SYS],
		);

		await run(
			db,
			`INSERT INTO restricted_region
			   (id, country_code, region_name, restriction_type, description, effective_from, created_by)
			 VALUES
			   ('a0500000-0000-0000-0000-000000000001', 'UA', 'Crimea', 'EMBARGOED', 'Crimea/Sevastopol per EO 13685', '2014-12-19', $1),
			   ('a0500000-0000-0000-0000-000000000002', 'UA', 'Donetsk', 'HEAVILY_RESTRICTED', 'Donetsk and Luhansk oblasts per EO 13660', '2022-02-21', $1)
			 ON CONFLICT (id) DO NOTHING`,
			[SYS],
		);

		// ── 10. Sales orders (mixed compliance) ───────────────────────────────
		await audit(db, E_US);

		// SO-001: Cleared order — Israel customer, LEO terminal hardware
		await run(
			db,
			`INSERT INTO sales_order
			   (id, entity_id, customer_id, order_number, order_date, required_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, created_by, updated_by)
			 VALUES ($1, $2, $3, 'SO-2026-0001', '2026-01-15', '2026-04-30',
			         'ILS', 845000, 845000, 225000,
			         'CONFIRMED', 'cleared',
			         'LEO terminal kit order — EAR99 classification confirmed, no license required',
			         $4, $4)
			 ON CONFLICT (entity_id, order_number) DO NOTHING`,
			[SO(1), E_US, CUS(16), SYS],
		);
		await run(
			db,
			`INSERT INTO sales_order_line
			   (id, sales_order_id, line_number, product_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, $3, 'VSAT Terminal Kit — LEO configuration', 15, 56333.33, 845000, 'ILS', now())
			 ON CONFLICT (sales_order_id, line_number) DO NOTHING`,
			[SOL(1, 1), SO(1), PROD(6)],
		);

		// SO-002: Pending compliance — capacity contract in GEO renewal negotiation
		await run(
			db,
			`INSERT INTO sales_order
			   (id, entity_id, customer_id, order_number, order_date, required_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, ext, created_by, updated_by)
			 VALUES ($1, $2, $3, 'SO-2026-0002', '2026-02-01', '2026-12-31',
			         'EUR', 3600000, 3600000, 3960000,
			         'PENDING_COMPLIANCE_CHECK', 'pending',
			         'GEO capacity contract renewal — APEX-1 transponder lease',
			         '{"order_type":"CAPACITY","capacity_mhz":36,"transponder":"Ku-Band-T7"}'::jsonb,
			         $4, $4)
			 ON CONFLICT (entity_id, order_number) DO NOTHING`,
			[SO(2), E_US, CUS(2), SYS],
		);
		await run(
			db,
			`INSERT INTO sales_order_line
			   (id, sales_order_id, line_number, product_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, $3, 'APEX-1 GEO Transponder Capacity — 36 MHz Ku-Band (12 months)', 12, 300000, 3600000, 'EUR', now())
			 ON CONFLICT (sales_order_id, line_number) DO NOTHING`,
			[SOL(2, 1), SO(2), PROD(1)],
		);

		// SO-003: Compliance hold — Crimea destination
		await run(
			db,
			`INSERT INTO sales_order
			   (id, entity_id, customer_id, order_number, order_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, created_by, updated_by)
			 VALUES ($1, $2, $3, 'SO-2026-0003', '2026-03-05',
			         'UAH', 2800000, 2800000, 68000,
			         'DRAFT', 'held',
			         'Order held — shipping address in Crimea region; requires Office of Compliance review',
			         $4, $4)
			 ON CONFLICT (entity_id, order_number) DO NOTHING`,
			[SO(3), E_US, CUS(18), SYS],
		);
		await run(
			db,
			`INSERT INTO sales_order_line
			   (id, sales_order_id, line_number, product_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, $3, 'VSAT Terminal Kit', 4, 700000, 2800000, 'UAH', now())
			 ON CONFLICT (sales_order_id, line_number) DO NOTHING`,
			[SOL(3, 1), SO(3), PROD(6)],
		);

		// Compliance hold record for SO-003
		await run(
			db,
			`INSERT INTO compliance_hold
			   (id, entity_id, held_table, held_record_id, hold_reason, status, placed_by, created_by, updated_by)
			 VALUES ($1, $2, 'sales_order', $3, 'AMBIGUOUS_REGION', 'ACTIVE', $4, $4, $4)
			 ON CONFLICT (id) DO NOTHING`,
			[HOLD(1), E_US, SO(3), SYS],
		);

		// SO-004: Cleared capacity contract — Norway customer
		await run(
			db,
			`INSERT INTO sales_order
			   (id, entity_id, customer_id, order_number, order_date, required_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, ext, created_by, updated_by)
			 VALUES ($1, $2, $3, 'SO-2026-0004', '2026-01-10', '2026-12-31',
			         'USD', 1200000, 1200000, 1200000,
			         'RELEASED_TO_FULFILLMENT', 'cleared',
			         'LEO constellation capacity — maritime mobility',
			         '{"order_type":"CAPACITY","orbit":"LEO","beam":"global"}'::jsonb,
			         $4, $4)
			 ON CONFLICT (entity_id, order_number) DO NOTHING`,
			[SO(4), E_US, CUS(4), SYS],
		);
		await run(
			db,
			`INSERT INTO sales_order_line
			   (id, sales_order_id, line_number, product_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, $3, 'ORBIT LEO Mobility Capacity — Maritime (12 months)', 12, 100000, 1200000, 'USD', now())
			 ON CONFLICT (sales_order_id, line_number) DO NOTHING`,
			[SOL(4, 1), SO(4), PROD(4)],
		);

		// SO-005: Cleared order — UK customer, GND service subscription
		await run(
			db,
			`INSERT INTO sales_order
			   (id, entity_id, customer_id, order_number, order_date, required_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, created_by, updated_by)
			 VALUES ($1, $2, $3, 'SO-2026-0005', '2026-02-20', '2026-12-31',
			         'GBP', 84000, 84000, 105000,
			         'CONFIRMED', 'cleared', $4, $4)
			 ON CONFLICT (entity_id, order_number) DO NOTHING`,
			[SO(5), E_US, CUS(10), SYS],
		);
		await run(
			db,
			`INSERT INTO sales_order_line
			   (id, sales_order_id, line_number, product_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, $3, 'Ground Station Operations Service — UK hub (12 months)', 12, 7000, 84000, 'GBP', now())
			 ON CONFLICT (sales_order_id, line_number) DO NOTHING`,
			[SOL(5, 1), SO(5), PROD(7)],
		);

		// ── 11. Purchase orders ────────────────────────────────────────────────
		await audit(db, E_US);

		// PO-001: Launch vehicle — milestone payments
		await run(
			db,
			`INSERT INTO purchase_order
			   (id, entity_id, vendor_id, po_number, po_date, expected_delivery_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, created_by, updated_by)
			 VALUES ($1, $2, $3, 'PO-2026-0001', '2026-01-20', '2027-06-01',
			         'USD', 85000000, 85000000, 85000000,
			         'APPROVED', 'cleared',
			         'LEO constellation launch — SpaceLift rideshare manifest, 24 bus-A satellites',
			         $4, $4)
			 ON CONFLICT (entity_id, po_number) DO NOTHING`,
			[PO_ID(1), E_US, VEN(1), SYS],
		);
		await run(
			db,
			`INSERT INTO purchase_order_line
			   (id, purchase_order_id, line_number, inventory_item_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, NULL, 'Rideshare launch service — LEO 550km SSO, 24 satellites', 1, 85000000, 85000000, 'USD', now())
			 ON CONFLICT (purchase_order_id, line_number) DO NOTHING`,
			[POL_ID(1, 1), PO_ID(1)],
		);

		// PO-002: Satellite components
		await run(
			db,
			`INSERT INTO purchase_order
			   (id, entity_id, vendor_id, po_number, po_date, expected_delivery_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, created_by, updated_by)
			 VALUES ($1, $2, $3, 'PO-2026-0002', '2026-02-10', '2026-09-30',
			         'USD', 4200000, 4200000, 4200000,
			         'SENT', 'pending', $4, $4)
			 ON CONFLICT (entity_id, po_number) DO NOTHING`,
			[PO_ID(2), E_US, VEN(8), SYS],
		);
		await run(
			db,
			`INSERT INTO purchase_order_line
			   (id, purchase_order_id, line_number, inventory_item_id, description, quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, NULL, 'Ku-Band Transponder Assembly — flight grade, 24 units', 24, 175000, 4200000, 'USD', now())
			 ON CONFLICT (purchase_order_id, line_number) DO NOTHING`,
			[POL_ID(2, 1), PO_ID(2)],
		);

		// ── 12. Journal entries and trial balance ─────────────────────────────
		// Period 1 (Jan 2026): opening balances
		await audit(db, E_US);

		await run(
			db,
			`INSERT INTO journal_entry
			   (id, entity_id, entry_number, entry_date, fiscal_period_id, description,
			    source_module, status, posted_at, posted_by, created_by, updated_by)
			 VALUES ($1, $2, 'JE-2026-0001', '2026-01-31', $3, 'Opening balance — FY2026',
			         'GL', 'POSTED', '2026-01-31 23:59:00', $4, $4, $4)
			 ON CONFLICT (entity_id, entry_number) DO NOTHING`,
			[JE(1), E_US, FP(1), SYS],
		);
		// Opening balances: Cash $12M, AR $3.5M, Inventory $800K, Equipment $8M
		//                   AP $1.5M, Deferred Rev $2M, Retained Earnings $20.8M
		// Trial balance: Debits = Credits
		const je1Lines: [string, string, number, number][] = [
			[JEL(1, 1), acct(1100), 12_000_000, 0], // Cash DEBIT
			[JEL(1, 2), acct(1200), 3_500_000, 0], //  AR DEBIT
			[JEL(1, 3), acct(1300), 800_000, 0], //   Inventory DEBIT
			[JEL(1, 4), acct(1500), 8_000_000, 0], //  Equipment DEBIT
			[JEL(1, 5), acct(2100), 0, 1_500_000], // AP CREDIT
			[JEL(1, 6), acct(2300), 0, 2_000_000], // Deferred Rev CREDIT
			[JEL(1, 7), acct(3100), 0, 20_800_000], // Retained Earnings CREDIT
		];
		for (const [id, accountId, debit, credit] of je1Lines) {
			await run(
				db,
				`INSERT INTO journal_entry_line
				   (id, journal_entry_id, line_number, account_id, debit_amount, credit_amount,
				    currency_code, base_debit_amount, base_credit_amount, created_at)
				 VALUES ($1, $2, (SELECT COALESCE(MAX(line_number),0)+1 FROM journal_entry_line WHERE journal_entry_id=$2), $3, $4, $5, 'USD', $4, $5, now())
				 ON CONFLICT (id) DO NOTHING`,
				[id, JE(1), accountId, debit, credit],
			);
		}

		// Period 2 (Feb 2026): revenue and expense activity
		await run(
			db,
			`INSERT INTO journal_entry
			   (id, entity_id, entry_number, entry_date, fiscal_period_id, description,
			    source_module, status, posted_at, posted_by, created_by, updated_by)
			 VALUES ($1, $2, 'JE-2026-0002', '2026-02-28', $3, 'Feb 2026 — GEO capacity revenue',
			         'AR', 'POSTED', '2026-02-28 23:59:00', $4, $4, $4)
			 ON CONFLICT (entity_id, entry_number) DO NOTHING`,
			[JE(2), E_US, FP(2), SYS],
		);
		const je2Lines: [string, string, number, number][] = [
			[JEL(2, 1), acct(1200), 300_000, 0], // AR DEBIT
			[JEL(2, 2), acct(4100), 0, 300_000], // Capacity Revenue CREDIT
		];
		for (const [id, accountId, debit, credit] of je2Lines) {
			await run(
				db,
				`INSERT INTO journal_entry_line
				   (id, journal_entry_id, line_number, account_id, debit_amount, credit_amount,
				    currency_code, base_debit_amount, base_credit_amount, created_at)
				 VALUES ($1, $2, (SELECT COALESCE(MAX(line_number),0)+1 FROM journal_entry_line WHERE journal_entry_id=$2), $3, $4, $5, 'USD', $4, $5, now())
				 ON CONFLICT (id) DO NOTHING`,
				[id, JE(2), accountId, debit, credit],
			);
		}

		// Period 2: expenses
		await run(
			db,
			`INSERT INTO journal_entry
			   (id, entity_id, entry_number, entry_date, fiscal_period_id, description,
			    source_module, status, posted_at, posted_by, created_by, updated_by)
			 VALUES ($1, $2, 'JE-2026-0003', '2026-02-28', $3, 'Feb 2026 — Payroll and launch ops',
			         'GL', 'POSTED', '2026-02-28 23:59:00', $4, $4, $4)
			 ON CONFLICT (entity_id, entry_number) DO NOTHING`,
			[JE(3), E_US, FP(2), SYS],
		);
		const je3Lines: [string, string, number, number][] = [
			[JEL(3, 1), acct(5200), 180_000, 0], // Salaries DEBIT
			[JEL(3, 2), acct(5300), 45_000, 0], //  Launch ops DEBIT
			[JEL(3, 3), acct(2200), 0, 225_000], //  Accrued liabilities CREDIT
		];
		for (const [id, accountId, debit, credit] of je3Lines) {
			await run(
				db,
				`INSERT INTO journal_entry_line
				   (id, journal_entry_id, line_number, account_id, debit_amount, credit_amount,
				    currency_code, base_debit_amount, base_credit_amount, created_at)
				 VALUES ($1, $2, (SELECT COALESCE(MAX(line_number),0)+1 FROM journal_entry_line WHERE journal_entry_id=$2), $3, $4, $5, 'USD', $4, $5, now())
				 ON CONFLICT (id) DO NOTHING`,
				[id, JE(3), accountId, debit, credit],
			);
		}

		// Period 3 (Mar 2026, SOFT_CLOSED): draft month-end entries
		await run(
			db,
			`INSERT INTO journal_entry
			   (id, entity_id, entry_number, entry_date, fiscal_period_id, description,
			    source_module, status, created_by, updated_by)
			 VALUES ($1, $2, 'JE-2026-0004', '2026-03-31', $3, 'Mar 2026 — Month-end accruals (in review)',
			         'GL', 'DRAFT', $4, $4)
			 ON CONFLICT (entity_id, entry_number) DO NOTHING`,
			[JE(4), E_US, FP(3), SYS],
		);

		// ── 13. CRM pipeline ──────────────────────────────────────────────────
		await audit(db, E_US);

		// Pipeline stages
		const stages: [string, string, string, number, number, boolean, boolean][] = [
			[STAGE(1), "PROSPECT", "Prospect", 10, 10, false, false],
			[STAGE(2), "QUALIFIED", "Qualified", 20, 25, false, false],
			[STAGE(3), "PROPOSAL", "Proposal Sent", 30, 40, false, false],
			[STAGE(4), "NEGOTIATION", "Negotiation", 40, 65, false, false],
			[STAGE(5), "CLOSED_WON", "Closed Won", 50, 100, true, false],
			[STAGE(6), "CLOSED_LOST", "Closed Lost", 60, 0, false, true],
		];
		for (const [id, code, name, order, prob, isWon, isLost] of stages) {
			await run(
				db,
				`INSERT INTO pipeline_stage
				   (id, entity_id, code, name, stage_order, win_probability, is_closed_won, is_closed_lost, created_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT (entity_id, code) DO NOTHING`,
				[id, E_US, code, name, order, prob, isWon, isLost, SYS],
			);
		}

		// CRM companies (linked to customers)
		const crmCompanies: [string, string, string, string][] = [
			[CRMC(1), "EuroSat Television GmbH", "DE", CUS(2)],
			[CRMC(2), "AfricaSat Broadband (Pty) Ltd", "ZA", CUS(14)],
			[CRMC(3), "Japan SkyNet K.K.", "JP", CUS(8)],
			[CRMC(4), "Israel SkyTel Ltd.", "IL", CUS(16)],
			[CRMC(5), "UAE Sky Communications LLC", "AE", CUS(15)],
		];
		for (const [id, name, country, custId] of crmCompanies) {
			await run(
				db,
				`INSERT INTO crm_company
				   (id, entity_id, name, country_code, customer_id, owner_user_id, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
				 ON CONFLICT (id) DO NOTHING`,
				[id, E_US, name, country, custId, SYS],
			);
		}

		// CRM contacts
		const crmContacts: [string, string, string, string, string, string][] = [
			[CRMCT(1), CRMC(1), "Hans", "Mueller", "h.mueller@eurosat.tv", "Director of Technology"],
			[CRMCT(2), CRMC(2), "Thabo", "Nkosi", "t.nkosi@africasat.co.za", "VP Commercial"],
			[
				CRMCT(3),
				CRMC(3),
				"Kenji",
				"Yamamoto",
				"k.yamamoto@japanskynet.co.jp",
				"Head of Procurement",
			],
			[CRMCT(4), CRMC(4), "Avi", "Cohen", "a.cohen@israelsky.co.il", "CTO"],
			[CRMCT(5), CRMC(5), "Mohammed", "Al-Rashid", "m.alrashid@uaesky.ae", "CEO"],
		];
		for (const [id, compId, first, last, email, title] of crmContacts) {
			await run(
				db,
				`INSERT INTO crm_contact
				   (id, entity_id, crm_company_id, first_name, last_name, email, job_title, owner_user_id, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8)
				 ON CONFLICT (id) DO NOTHING`,
				[id, E_US, compId, first, last, email, title, SYS],
			);
		}

		// Opportunities at various pipeline stages
		const opps: [string, string, string, string, number, string, string][] = [
			[
				OPP(1),
				CRMC(1),
				"EuroSat APEX-2 GEO Video Contract 2027",
				STAGE(4),
				2_400_000,
				"EUR",
				"2026-06-30",
			],
			[OPP(2), CRMC(2), "AfricaSat LEO Broadband RFP", STAGE(3), 900_000, "USD", "2026-08-15"],
			[
				OPP(3),
				CRMC(3),
				"JapanSkyNet Maritime LEO — 2nd tranche",
				STAGE(2),
				1_500_000,
				"JPY",
				"2026-09-30",
			],
			[
				OPP(4),
				CRMC(4),
				"Israel SkyTel LEO Terminal Expansion",
				STAGE(5),
				560_000,
				"ILS",
				"2026-03-31",
			],
			[
				OPP(5),
				CRMC(5),
				"UAE Sky GEO Maritime VSAT Upgrade",
				STAGE(1),
				750_000,
				"AED",
				"2026-12-31",
			],
		];
		for (const [id, compId, name, stageId, amount, currency, closeDate] of opps) {
			await run(
				db,
				`INSERT INTO opportunity
				   (id, entity_id, crm_company_id, name, pipeline_stage_id, amount, currency_code,
				    expected_close_date, owner_user_id, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9)
				 ON CONFLICT (id) DO NOTHING`,
				[id, E_US, compId, name, stageId, amount, currency, closeDate, SYS],
			);
		}

		// ── 14. EU entity setup: fiscal year and accounts for intercompany JEs ─────
		await audit(db, E_EU);

		await run(
			db,
			`INSERT INTO fiscal_year (id, entity_id, year_label, start_date, end_date, created_by, updated_by)
			 VALUES ($1, $2, 'FY2026', '2026-01-01', '2026-12-31', $3, $3)
			 ON CONFLICT (entity_id, year_label) DO NOTHING`,
			[FY_EU, E_EU, SYS],
		);

		const euMonths: [number, string, string, string, string][] = [
			[1, "Jan", "01-01", "01-31", "HARD_CLOSED"],
			[2, "Feb", "02-01", "02-28", "HARD_CLOSED"],
			[3, "Mar", "03-01", "03-31", "SOFT_CLOSED"],
			[4, "Apr", "04-01", "04-30", "OPEN"],
		];
		for (const [n, label, start, end, status] of euMonths) {
			await run(
				db,
				`INSERT INTO fiscal_period
				   (id, fiscal_year_id, entity_id, period_number, period_label,
				    start_date, end_date, status, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
				 ON CONFLICT (fiscal_year_id, period_number) DO NOTHING`,
				[FP_EU(n), FY_EU, E_EU, n, `2026-${label}`, `2026-${start}`, `2026-${end}`, status, SYS],
			);
		}

		// Minimal chart of accounts for ODC-EU (intercompany positions)
		const euAccts: [string, string, string, string, string, boolean][] = [
			[acctEU(1200), "1200", "Accounts Receivable — Intercompany", "ASSET", "DEBIT", false],
			[acctEU(2100), "2100", "Accounts Payable — Intercompany", "LIABILITY", "CREDIT", false],
			[acctEU(4100), "4100", "Intercompany Revenue", "REVENUE", "CREDIT", false],
			[acctEU(5100), "5100", "Management Fee Expense", "EXPENSE", "DEBIT", false],
		];
		for (const [id, num, name, type, nb, isHeader] of euAccts) {
			await run(
				db,
				`INSERT INTO account
				   (id, entity_id, account_number, name, account_type, normal_balance, is_header, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
				 ON CONFLICT (entity_id, account_number) DO NOTHING`,
				[id, E_EU, num, name, type, nb, isHeader, SYS],
			);
		}

		// ── 15. Compliance scenario: denied-party match (SDN screening → held) ────
		await audit(db, E_US);

		// SDN entry matching the Iranian customer by name
		await run(
			db,
			`INSERT INTO screening_list_entry
			   (id, screening_list_id, entry_name, country_codes, remarks, listed_date)
			 VALUES ($1, $2, 'Iranian Space Research Institute', ARRAY['IR'],
			         'Iranian sanctioned research entity — OFAC SDN list', '2019-06-24')
			 ON CONFLICT (id) DO NOTHING`,
			[SLE_IRAN, SL_SDN],
		);

		// SO-006: denied-party match — Iranian customer, VSAT hardware order
		await run(
			db,
			`INSERT INTO sales_order
			   (id, entity_id, customer_id, order_number, order_date,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, created_by, updated_by)
			 VALUES ($1, $2, $3, 'SO-2026-0006', '2026-03-20',
			         'USD', 320000, 320000, 320000,
			         'DRAFT', 'held',
			         'Order blocked — customer name confirmed match on OFAC SDN list; cannot proceed',
			         $4, $4)
			 ON CONFLICT (entity_id, order_number) DO NOTHING`,
			[SO(6), E_US, CUS(19), SYS],
		);
		await run(
			db,
			`INSERT INTO sales_order_line
			   (id, sales_order_id, line_number, product_id, description,
			    quantity_ordered, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, $3, 'VSAT Terminal Kit — C-Band configuration', 4, 80000, 320000, 'USD', now())
			 ON CONFLICT (sales_order_id, line_number) DO NOTHING`,
			[SOL(6, 1), SO(6), PROD(6)],
		);

		// Screening result for SO-006 (falls in 2026-04 partition)
		await run(
			db,
			`INSERT INTO screening_result
			   (id, entity_id, screened_table, screened_record_id, screened_name,
			    screening_date, screening_type, overall_result, match_count,
			    reviewed_by, reviewed_at, review_decision, review_notes, created_by)
			 VALUES ($1, $2, 'sales_order', $3, 'Iranian Space Research Institute',
			         '2026-04-01 09:00:00+00', 'AUTOMATED', 'CONFIRMED_MATCH', 1,
			         $4, '2026-04-01 10:30:00+00', 'BLOCKED',
			         'Confirmed SDN match: Iranian Space Research Institute. Order blocked by compliance.', $4)
			 ON CONFLICT (id, screening_date) DO NOTHING`,
			[SR_IRAN, E_US, SO(6), SYS],
		);

		// Denied-party match record
		await run(
			db,
			`INSERT INTO denied_party_match
			   (id, screening_result_id, screening_list_entry_id, match_score,
			    match_algorithm, matched_fields)
			 VALUES ('b0200000-0000-0000-0000-000000000001', $1, $2, 0.9800,
			         'EXACT_NAME', '{"name":"Iranian Space Research Institute"}'::jsonb)
			 ON CONFLICT (id) DO NOTHING`,
			[SR_IRAN, SLE_IRAN],
		);

		// Compliance hold for SO-006
		await run(
			db,
			`INSERT INTO compliance_hold
			   (id, entity_id, held_table, held_record_id, hold_reason,
			    screening_result_id, status, placed_by, created_by, updated_by)
			 VALUES ($1, $2, 'sales_order', $3, 'SCREENING_MATCH', $4, 'ACTIVE', $5, $5, $5)
			 ON CONFLICT (id) DO NOTHING`,
			[HOLD(2), E_US, SO(6), SR_IRAN, SYS],
		);

		// ── 16. Compliance scenario: unclassified item blocked at quote stage ─────
		await audit(db, E_US);

		// Unclassified military-grade product (no USML/CCL classification yet)
		await run(
			db,
			`INSERT INTO product
			   (id, entity_id, product_code, name, description, product_type, unit_of_measure,
			    ext, created_by, updated_by)
			 VALUES ($1, $2, 'KU-CONV-MIL', 'Ku-Band Frequency Converter (Military Grade)',
			         'High-power Ku-band up/down converter — USML/CCL classification pending review',
			         'GOOD', 'EA',
			         '{"classification_status":"PENDING","awaiting_export_review":true}'::jsonb,
			         $3, $3)
			 ON CONFLICT (entity_id, product_code) DO NOTHING`,
			[PROD(8), E_US, SYS],
		);

		// QT-2026-0001: draft quote with unclassified item — blocked from converting to order
		await run(
			db,
			`INSERT INTO quote
			   (id, entity_id, customer_id, quote_number, quote_date, valid_until,
			    currency_code, subtotal_amount, total_amount, base_total_amount,
			    status, compliance_status, notes, ext, created_by, updated_by)
			 VALUES ($1, $2, $3, 'QT-2026-0001', '2026-03-28', '2026-04-28',
			         'USD', 240000, 240000, 240000,
			         'DRAFT', 'held',
			         'Quote blocked — Ku-Band Converter (Military Grade) has no USML/CCL classification; cannot convert to order',
			         '{"block_reason":"UNCLASSIFIED_ITEM","blocked_line_items":["KU-CONV-MIL"]}'::jsonb,
			         $4, $4)
			 ON CONFLICT (entity_id, quote_number) DO NOTHING`,
			[QT1, E_US, CUS(4), SYS],
		);
		await run(
			db,
			`INSERT INTO quote_line
			   (id, quote_id, line_number, product_id, description, quantity, unit_price,
			    discount_percent, amount, currency_code)
			 VALUES ($1, $2, 1, $3,
			         'Ku-Band Frequency Converter (Military Grade) — 3 units, classification pending',
			         3, 80000, 0, 240000, 'USD')
			 ON CONFLICT (quote_id, line_number) DO NOTHING`,
			[QT1L1, QT1, PROD(8)],
		);

		// Compliance hold for the unclassified-item quote
		await run(
			db,
			`INSERT INTO compliance_hold
			   (id, entity_id, held_table, held_record_id, hold_reason, status, placed_by, created_by, updated_by)
			 VALUES ($1, $2, 'quote', $3, 'CLASSIFICATION_REQUIRED', 'ACTIVE', $4, $4, $4)
			 ON CONFLICT (id) DO NOTHING`,
			[HOLD(3), E_US, QT1, SYS],
		);

		// ── 17. AR aging with customer invoices and credit hold ───────────────────
		await audit(db, E_US);

		// Put Brazil Telecom on credit hold (overdue balance exceeds credit limit)
		await run(
			db,
			`UPDATE customer
			 SET credit_limit = 150000, credit_limit_currency = 'USD',
			     ext = ext || '{"credit_hold":true,"credit_hold_reason":"Overdue invoices exceed credit limit"}'::jsonb,
			     risk_rating = 'HIGH', updated_by = $1, updated_at = now()
			 WHERE id = $2 AND credit_limit IS NULL`,
			[SYS, CUS(6)],
		);

		interface InvoiceDef {
			seq: number;
			custId: string;
			num: string;
			date: string;
			due: string;
			currency: string;
			amount: number;
			baseAmount: number;
			received: number;
			status: string;
			soId?: string;
		}

		const arInvoices: InvoiceDef[] = [
			// 90+ days overdue — Brazil Telecom on credit hold ($120K, exceeds $150K limit)
			{
				seq: 1,
				custId: CUS(6),
				num: "INV-2026-0001",
				date: "2026-01-20",
				due: "2026-02-19",
				currency: "USD",
				amount: 120000,
				baseAmount: 120000,
				received: 0,
				status: "SENT",
			},
			// 60+ days overdue — Mexico VSAT, partial payment received
			{
				seq: 2,
				custId: CUS(20),
				num: "INV-2026-0002",
				date: "2026-01-31",
				due: "2026-03-02",
				currency: "USD",
				amount: 45000,
				baseAmount: 45000,
				received: 20000,
				status: "PARTIALLY_PAID",
			},
			// 30+ days overdue — Australia, unpaid
			{
				seq: 3,
				custId: CUS(5),
				num: "INV-2026-0003",
				date: "2026-02-28",
				due: "2026-03-30",
				currency: "USD",
				amount: 28000,
				baseAmount: 28000,
				received: 0,
				status: "SENT",
			},
			// Current — UK VSAT (within terms), linked to SO-005
			{
				seq: 4,
				custId: CUS(10),
				num: "INV-2026-0004",
				date: "2026-03-20",
				due: "2026-04-19",
				currency: "GBP",
				amount: 7000,
				baseAmount: 8750,
				received: 0,
				status: "SENT",
				soId: SO(5),
			},
			// Current — Israel SkyTel cleared ILS invoice, linked to SO-001
			{
				seq: 5,
				custId: CUS(16),
				num: "INV-2026-0005",
				date: "2026-03-28",
				due: "2026-04-27",
				currency: "ILS",
				amount: 281667,
				baseAmount: 75000,
				received: 0,
				status: "SENT",
				soId: SO(1),
			},
		];

		for (const inv of arInvoices) {
			const balance = inv.amount - inv.received;
			await run(
				db,
				`INSERT INTO customer_invoice
				   (id, entity_id, customer_id, invoice_number, invoice_date, due_date,
				    currency_code, exchange_rate, subtotal_amount, total_amount, base_total_amount,
				    amount_received, balance_due, status, fiscal_period_id, sales_order_id,
				    payment_terms, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, 1.0, $8, $8, $9, $10, $11, $12,
				         $13, $14, 'NET30', $15, $15)
				 ON CONFLICT (entity_id, invoice_number) DO NOTHING`,
				[
					CI(inv.seq),
					E_US,
					inv.custId,
					inv.num,
					inv.date,
					inv.due,
					inv.currency,
					inv.amount,
					inv.baseAmount,
					inv.received,
					balance,
					inv.status,
					FP(inv.seq <= 3 ? inv.seq : 3), // map to appropriate closed period
					inv.soId ?? null,
					SYS,
				],
			);
			await run(
				db,
				`INSERT INTO customer_invoice_line
				   (id, customer_invoice_id, line_number, description, account_id,
				    quantity, unit_price, amount, currency_code)
				 VALUES ($1, $2, 1, 'Services rendered per contract terms', $3, 1, $4, $4, $5)
				 ON CONFLICT (customer_invoice_id, line_number) DO NOTHING`,
				[CIL(inv.seq), CI(inv.seq), acct(4100), inv.amount, inv.currency],
			);
		}

		// ── 18. AP aging with overdue vendor bills ────────────────────────────────
		await audit(db, E_US);

		interface BillDef {
			seq: number;
			vendId: string;
			billNum: string;
			internalRef: string;
			date: string;
			due: string;
			currency: string;
			exRate: number;
			amount: number;
			baseAmount: number;
			paid: number;
			status: string;
			periodId: string;
		}

		const apBills: BillDef[] = [
			// 90+ days overdue — Ariane Group (EUR) launch prep services
			{
				seq: 1,
				vendId: VEN(2),
				billNum: "AGSAS-2026-0089",
				internalRef: "BILL-2026-AP001",
				date: "2025-12-15",
				due: "2026-01-14",
				currency: "EUR",
				exRate: 1.08,
				amount: 185000,
				baseAmount: 199800,
				paid: 0,
				status: "POSTED",
				periodId: FP(1),
			},
			// 45 days overdue — SolarTech Power Systems (EUR) component delivery
			{
				seq: 2,
				vendId: VEN(7),
				billNum: "STPS-2026-0214",
				internalRef: "BILL-2026-AP002",
				date: "2026-01-31",
				due: "2026-03-02",
				currency: "EUR",
				exRate: 1.08,
				amount: 42000,
				baseAmount: 45360,
				paid: 0,
				status: "POSTED",
				periodId: FP(1),
			},
			// 20 days overdue — Frequency Clearance Consultants (USD)
			{
				seq: 3,
				vendId: VEN(13),
				billNum: "FCC-2026-0055",
				internalRef: "BILL-2026-AP003",
				date: "2026-02-28",
				due: "2026-03-15",
				currency: "USD",
				exRate: 1.0,
				amount: 28500,
				baseAmount: 28500,
				paid: 0,
				status: "POSTED",
				periodId: FP(2),
			},
			// Current — Launch Operations Services (USD), within NET30 terms
			{
				seq: 4,
				vendId: VEN(15),
				billNum: "LOSC-2026-0118",
				internalRef: "BILL-2026-AP004",
				date: "2026-03-31",
				due: "2026-04-30",
				currency: "USD",
				exRate: 1.0,
				amount: 125000,
				baseAmount: 125000,
				paid: 0,
				status: "APPROVED",
				periodId: FP(3),
			},
		];

		for (const bill of apBills) {
			const balance = bill.amount - bill.paid;
			await run(
				db,
				`INSERT INTO vendor_bill
				   (id, entity_id, vendor_id, bill_number, internal_ref, bill_date, due_date,
				    currency_code, exchange_rate, subtotal_amount, tax_amount,
				    total_amount, base_total_amount, amount_paid, balance_due,
				    status, fiscal_period_id, payment_terms, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, $11, $12, $13, $14,
				         $15, 'NET30', $16, $16)
				 ON CONFLICT (entity_id, vendor_id, bill_number) DO NOTHING`,
				[
					VB(bill.seq),
					E_US,
					bill.vendId,
					bill.billNum,
					bill.internalRef,
					bill.date,
					bill.due,
					bill.currency,
					bill.exRate,
					bill.amount,
					bill.baseAmount,
					bill.paid,
					balance,
					bill.status,
					bill.periodId,
					SYS,
				],
			);
			await run(
				db,
				`INSERT INTO vendor_bill_line
				   (id, vendor_bill_id, line_number, description, account_id,
				    quantity, unit_price, amount, currency_code)
				 VALUES ($1, $2, 1, 'Per vendor invoice — AP aging', $3, 1, $4, $4, $5)
				 ON CONFLICT (vendor_bill_id, line_number) DO NOTHING`,
				[VBL(bill.seq), VB(bill.seq), acct(5100), bill.amount, bill.currency],
			);
		}

		// ── 19. Inventory items, lots, goods receipt, three-way match ─────────────
		await audit(db, E_US);

		// Lot-tracked: Ku-Band Transponder Assembly (matches PO-002 line item)
		await run(
			db,
			`INSERT INTO inventory_item
			   (id, entity_id, item_code, name, description, category, unit_of_measure,
			    is_serialized, is_lot_tracked, standard_cost, cost_currency_code,
			    created_by, updated_by)
			 VALUES ($1, $2, 'KUBAND-XPDR', 'Ku-Band Transponder Assembly',
			         'Flight-grade Ku-band transponder — lot-tracked per ITAR', 'COMPONENTS', 'EA',
			         FALSE, TRUE, 175000, 'USD', $3, $3)
			 ON CONFLICT (entity_id, item_code) DO NOTHING`,
			[ITEM(1), E_US, SYS],
		);

		// Serialized: VSAT Terminal Kit (for end-use tracking on cleared export orders)
		await run(
			db,
			`INSERT INTO inventory_item
			   (id, entity_id, item_code, name, description, category, unit_of_measure,
			    is_serialized, is_lot_tracked, standard_cost, cost_currency_code,
			    created_by, updated_by)
			 VALUES ($1, $2, 'VSAT-TERM-INV', 'VSAT Terminal Kit (Inventory)',
			         'Ku-band VSAT terminal — serialized for end-use certificate tracking',
			         'FINISHED_GOODS', 'EA', TRUE, FALSE, 32000, 'USD', $3, $3)
			 ON CONFLICT (entity_id, item_code) DO NOTHING`,
			[ITEM(2), E_US, SYS],
		);

		// Lot for the first transponder receipt batch (from RadComm, PO-2026-0002)
		await run(
			db,
			`INSERT INTO lot
			   (id, entity_id, inventory_item_id, lot_number, manufacture_date,
			    supplier_lot_number, status, created_by)
			 VALUES ($1, $2, $3, 'LOT-XPDR-2026-001', '2026-01-15', 'RCMM-26-JAN-0041', 'AVAILABLE', $4)
			 ON CONFLICT (entity_id, inventory_item_id, lot_number) DO NOTHING`,
			[LOT1, E_US, ITEM(1), SYS],
		);

		// Serial numbers for two VSAT terminals (for Israel cleared order)
		for (let i = 1; i <= 2; i++) {
			await run(
				db,
				`INSERT INTO serial_number
				   (id, entity_id, inventory_item_id, serial_number, status, created_by)
				 VALUES ($1, $2, $3, $4, 'AVAILABLE', $5)
				 ON CONFLICT (entity_id, inventory_item_id, serial_number) DO NOTHING`,
				[SER(i), E_US, ITEM(2), `VSAT-SN-2026-${String(i).padStart(4, "0")}`, SYS],
			);
		}

		// Link PO-002 line to the inventory item (enables three-way match)
		await run(
			db,
			`UPDATE purchase_order_line
			 SET inventory_item_id = $1
			 WHERE id = $2 AND inventory_item_id IS NULL`,
			[ITEM(1), POL_ID(2, 1)],
		);

		// GR-2026-0001: partial goods receipt against PO-002 (12 of 24 units)
		await run(
			db,
			`INSERT INTO goods_receipt
			   (id, entity_id, purchase_order_id, receipt_number, receipt_date, status,
			    received_by, location_id, notes, created_by, updated_by)
			 VALUES ($1, $2, $3, 'GR-2026-0001', '2026-03-15', 'POSTED',
			         $4, $5, '12 of 24 Ku-Band Transponder Assemblies received; lot LOT-XPDR-2026-001',
			         $4, $4)
			 ON CONFLICT (entity_id, receipt_number) DO NOTHING`,
			[GR1, E_US, PO_ID(2), SYS, LOC(1)],
		);
		await run(
			db,
			`INSERT INTO goods_receipt_line
			   (id, goods_receipt_id, purchase_order_line_id, line_number,
			    quantity_received, quantity_accepted, quantity_rejected, lot_id, location_id)
			 VALUES ($1, $2, $3, 1, 12, 12, 0, $4, $5)
			 ON CONFLICT (goods_receipt_id, line_number) DO NOTHING`,
			[GRL1, GR1, POL_ID(2, 1), LOT1, LOC(1)],
		);

		// Three-way match: vendor bill references PO-002 + GR-2026-0001
		// Matches 12 received units × $175,000 = $2,100,000
		const VB_3WM = "c2900000-0000-0000-0000-000000000001";
		const VBL_3WM = "c2900000-0000-0000-0000-000000000002";
		await run(
			db,
			`INSERT INTO vendor_bill
			   (id, entity_id, vendor_id, bill_number, internal_ref, bill_date, due_date,
			    currency_code, exchange_rate, subtotal_amount, tax_amount,
			    total_amount, base_total_amount, amount_paid, balance_due,
			    status, purchase_order_id, goods_receipt_id, fiscal_period_id,
			    payment_terms, notes, created_by, updated_by)
			 VALUES ($1, $2, $3, 'RCMM-INV-2026-0892', 'BILL-2026-3WM', '2026-03-20', '2026-04-19',
			         'USD', 1.0, 2100000, 0, 2100000, 2100000, 0, 2100000,
			         'APPROVED', $4, $5, $6, 'NET30',
			         'Three-way match: PO-2026-0002 × GR-2026-0001 — 12 units Ku-Band Transponder',
			         $7, $7)
			 ON CONFLICT (entity_id, vendor_id, bill_number) DO NOTHING`,
			[VB_3WM, E_US, VEN(8), PO_ID(2), GR1, FP(3), SYS],
		);
		await run(
			db,
			`INSERT INTO vendor_bill_line
			   (id, vendor_bill_id, line_number, description, account_id,
			    quantity, unit_price, amount, currency_code, purchase_order_line_id)
			 VALUES ($1, $2, 1,
			         '12 × Ku-Band Transponder Assembly @ $175,000 — matched to GR-2026-0001',
			         $3, 12, 175000, 2100000, 'USD', $4)
			 ON CONFLICT (vendor_bill_id, line_number) DO NOTHING`,
			[VBL_3WM, VB_3WM, acct(1300), POL_ID(2, 1)],
		);

		// ── 20. Launch vehicle PO milestone payments (PO-001, $85M SpaceLift) ─────
		await audit(db, E_US);

		interface MilestoneDef {
			id: string;
			lineId: string;
			billNum: string;
			internalRef: string;
			date: string;
			due: string;
			amount: number;
			paid: number;
			status: string;
			notes: string;
			periodId: string;
		}

		const milestones: MilestoneDef[] = [
			{
				// Milestone 1: Contract signing 20% — already paid
				id: "c2800000-0000-0000-0000-000000000001",
				lineId: "c2801000-0000-0000-0000-000000000001",
				billNum: "SPLT-2026-M001",
				internalRef: "BILL-2026-LV001",
				date: "2026-01-25",
				due: "2026-02-24",
				amount: 17000000,
				paid: 17000000,
				status: "PAID",
				notes: "Milestone 1 of 3: Contract execution — 20% of $85M launch contract",
				periodId: FP(1),
			},
			{
				// Milestone 2: Integration start 50% — approved, due end of April
				id: "c2800000-0000-0000-0000-000000000002",
				lineId: "c2801000-0000-0000-0000-000000000002",
				billNum: "SPLT-2026-M002",
				internalRef: "BILL-2026-LV002",
				date: "2026-03-01",
				due: "2026-04-30",
				amount: 42500000,
				paid: 0,
				status: "APPROVED",
				notes: "Milestone 2 of 3: Satellite integration start — 50% of $85M launch contract",
				periodId: FP(3),
			},
			{
				// Milestone 3: Launch + orbit insertion 30% — draft (future)
				id: "c2800000-0000-0000-0000-000000000003",
				lineId: "c2801000-0000-0000-0000-000000000003",
				billNum: "SPLT-2027-M003",
				internalRef: "BILL-2027-LV003",
				date: "2027-05-01",
				due: "2027-06-01",
				amount: 25500000,
				paid: 0,
				status: "DRAFT",
				notes:
					"Milestone 3 of 3: Launch + orbit insertion confirmation — 30% of $85M launch contract",
				periodId: FP(4),
			},
		];

		for (const m of milestones) {
			const balance = m.amount - m.paid;
			await run(
				db,
				`INSERT INTO vendor_bill
				   (id, entity_id, vendor_id, bill_number, internal_ref, bill_date, due_date,
				    currency_code, exchange_rate, subtotal_amount, tax_amount,
				    total_amount, base_total_amount, amount_paid, balance_due,
				    status, purchase_order_id, fiscal_period_id,
				    payment_terms, notes, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', 1.0, $8, 0, $8, $8, $9, $10,
				         $11, $12, $13, 'NET30', $14, $15, $15)
				 ON CONFLICT (entity_id, vendor_id, bill_number) DO NOTHING`,
				[
					m.id,
					E_US,
					VEN(1),
					m.billNum,
					m.internalRef,
					m.date,
					m.due,
					m.amount,
					m.paid,
					balance,
					m.status,
					PO_ID(1),
					m.periodId,
					m.notes,
					SYS,
				],
			);
			await run(
				db,
				`INSERT INTO vendor_bill_line
				   (id, vendor_bill_id, line_number, description, account_id,
				    quantity, unit_price, amount, currency_code, purchase_order_line_id)
				 VALUES ($1, $2, 1, $3, $4, 1, $5, $5, 'USD', $6)
				 ON CONFLICT (vendor_bill_id, line_number) DO NOTHING`,
				[m.lineId, m.id, m.notes, acct(5300), m.amount, POL_ID(1, 1)],
			);
		}

		// ── 21. Intercompany transactions: US HQ charges EU subsidiary ────────────
		await audit(db, E_US);

		// Intercompany agreement: ODC-US provides shared satellite services to ODC-EU
		await run(
			db,
			`INSERT INTO intercompany_agreement
			   (id, entity_a_id, entity_b_id, agreement_number, description,
			    effective_from, transfer_pricing_method, is_active, created_by, updated_by)
			 VALUES ($1, $2, $3, 'ICA-2026-001',
			         'Shared satellite access and platform management — US HQ to EU subsidiary',
			         '2026-01-01', 'COST_PLUS', TRUE, $4, $4)
			 ON CONFLICT (agreement_number) DO NOTHING`,
			[ICA1, E_US, E_EU, SYS],
		);

		// US-side JE: DR Accounts Receivable (ICO due from EU), CR Ground Services Revenue
		await run(
			db,
			`INSERT INTO journal_entry
			   (id, entity_id, entry_number, entry_date, fiscal_period_id, description,
			    source_module, status, posted_at, posted_by, created_by, updated_by)
			 VALUES ($1, $2, 'JE-2026-0005', '2026-02-28', $3,
			         'Feb 2026 — Intercompany: management fee charged to ODC-EU (ICA-2026-001)',
			         'GL', 'POSTED', '2026-02-28 23:00:00+00', $4, $4, $4)
			 ON CONFLICT (entity_id, entry_number) DO NOTHING`,
			[JE(5), E_US, FP(2), SYS],
		);
		const je5Lines: [string, string, number, number][] = [
			[JEL(5, 1), acct(1200), 500_000, 0], // AR — ICO receivable from EU  DEBIT
			[JEL(5, 2), acct(4200), 0, 500_000], // Ground Services Revenue       CREDIT
		];
		for (const [id, accountId, debit, credit] of je5Lines) {
			await run(
				db,
				`INSERT INTO journal_entry_line
				   (id, journal_entry_id, line_number, account_id, debit_amount, credit_amount,
				    currency_code, base_debit_amount, base_credit_amount, created_at)
				 VALUES ($1, $2,
				         (SELECT COALESCE(MAX(line_number),0)+1 FROM journal_entry_line WHERE journal_entry_id=$2),
				         $3, $4, $5, 'USD', $4, $5, now())
				 ON CONFLICT (id) DO NOTHING`,
				[id, JE(5), accountId, debit, credit],
			);
		}

		// EU-side JE: DR Management Fee Expense, CR ICO Payable (due to US)
		// USD $500,000 at 1.08 EUR/USD = EUR 462,963
		await audit(db, E_EU);
		await run(
			db,
			`INSERT INTO journal_entry
			   (id, entity_id, entry_number, entry_date, fiscal_period_id, description,
			    source_module, status, posted_at, posted_by, created_by, updated_by)
			 VALUES ($1, $2, 'JE-EU-2026-0001', '2026-02-28', $3,
			         'Feb 2026 — Intercompany: management fee from ODC-US HQ (ICA-2026-001)',
			         'GL', 'POSTED', '2026-02-28 23:00:00+00', $4, $4, $4)
			 ON CONFLICT (entity_id, entry_number) DO NOTHING`,
			[JE(6), E_EU, FP_EU(2), SYS],
		);
		const je6Lines: [string, string, number, number][] = [
			[JEL(6, 1), acctEU(5100), 462_963, 0], // Management Fee Expense  DEBIT  (EUR)
			[JEL(6, 2), acctEU(2100), 0, 462_963], // ICO Payable due to US   CREDIT (EUR)
		];
		for (const [id, accountId, debit, credit] of je6Lines) {
			await run(
				db,
				`INSERT INTO journal_entry_line
				   (id, journal_entry_id, line_number, account_id, debit_amount, credit_amount,
				    currency_code, base_debit_amount, base_credit_amount, created_at)
				 VALUES ($1, $2,
				         (SELECT COALESCE(MAX(line_number),0)+1 FROM journal_entry_line WHERE journal_entry_id=$2),
				         $3, $4, $5, 'EUR', $4, $5, now())
				 ON CONFLICT (id) DO NOTHING`,
				[id, JE(6), accountId, debit, credit],
			);
		}

		// Link the two JEs via intercompany_transaction record
		await run(
			db,
			`INSERT INTO intercompany_transaction
			   (id, agreement_id, transaction_date, description,
			    entity_a_journal_entry_id, entity_b_journal_entry_id,
			    amount, currency_code, status, created_by, updated_by)
			 VALUES ($1, $2, '2026-02-28',
			         'Feb 2026 management fee: ODC-US charges ODC-EU per ICA-2026-001',
			         $3, $4, 500000, 'USD', 'MATCHED', $5, $5)
			 ON CONFLICT (id) DO NOTHING`,
			[ICT1, ICA1, JE(5), JE(6), SYS],
		);

		await db.query("COMMIT");
		console.log("✓ Orbital Dynamics Corp seed data applied successfully.");
		console.log("  Entities  : ODC-US, ODC-EU, ODC-APAC");
		console.log("  Demo user : demo@apogee.dev");
		console.log("  Customers : 22  Vendors : 16  Products : 8  (incl. unclassified item)");
		console.log("  Sales orders: 6 (2 cleared, 1 pending, 2 held, 1 released)");
		console.log("  Quotes    : 1 (QT-2026-0001 — unclassified item, held)");
		console.log("  POs       : 2   Journal entries: 6 (incl. intercompany US+EU)");
		console.log("  Compliance holds: 3 (Crimea region, SDN match, unclassified item)");
		console.log("  AR invoices: 5 (aging: 90d, 60d, 30d, current, current ILS)");
		console.log("  AP invoices: 4 (aging: 90d, 45d, 20d overdue + current)");
		console.log("  Launch vehicle milestones: 3 (paid, approved, draft)");
		console.log("  Goods receipt: GR-2026-0001 (12 transponders, lot-tracked)");
		console.log("  Three-way match: PO-2026-0002 × GR-2026-0001 × RCMM-INV-2026-0892");
		console.log("  Intercompany: ICA-2026-001 (US→EU management fee, $500K matched)");
		console.log("  Pipeline  : 5 opportunities across 6 stages");
	} catch (err) {
		await db.query("ROLLBACK");
		console.error("Seed failed:", err);
		process.exit(1);
	} finally {
		db.release();
		await pool.end();
	}
}

seed();
