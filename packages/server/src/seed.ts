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
			const orbitClass = code.includes("GEO") ? "GEO" : "LEO";
			const ext = JSON.stringify({ asset_type: "satellite", orbit_class: orbitClass });
			await run(
				db,
				`INSERT INTO product
				   (id, entity_id, product_code, name, description, product_type, unit_of_measure,
				    itar_compartment_id, ext, created_by, updated_by)
				 VALUES ($1, $2, $3, $4, $5, 'SERVICE', 'EA', $6, $7::jsonb, $8, $8)
				 ON CONFLICT (entity_id, product_code) DO NOTHING`,
				[id, E_US, code, name, desc, compartId, ext, SYS],
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
			   (id, country_code, region_name, sanctions_regime, effective_date, source_authority, created_by, updated_by)
			 VALUES
			   ('a0500000-0000-0000-0000-000000000001', 'UA', 'Crimea', 'EMBARGOED', '2014-12-19', 'Crimea/Sevastopol per EO 13685', $1, $1),
			   ('a0500000-0000-0000-0000-000000000002', 'UA', 'Donetsk', 'HEAVILY_RESTRICTED', '2022-02-21', 'Donetsk and Luhansk oblasts per EO 13660', $1, $1)
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
			   (id, purchase_order_id, line_number, inventory_item_id, description, quantity_ordered, unit_of_measure, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, NULL, 'Rideshare launch service — LEO 550km SSO, 24 satellites', 1, 'EA', 85000000, 85000000, 'USD', now())
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
			   (id, purchase_order_id, line_number, inventory_item_id, description, quantity_ordered, unit_of_measure, unit_price, amount, currency_code, created_at)
			 VALUES ($1, $2, 1, NULL, 'Ku-Band Transponder Assembly — flight grade, 24 units', 24, 'EA', 175000, 4200000, 'USD', now())
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

		await db.query("COMMIT");
		console.log("✓ Orbital Dynamics Corp seed data applied successfully.");
		console.log("  Entities  : ODC-US, ODC-EU, ODC-APAC");
		console.log("  Demo user : demo@apogee.dev");
		console.log("  Customers : 22  Vendors : 16  Products : 7");
		console.log("  Sales orders: 5 (2 cleared, 1 pending, 1 held, 1 released)");
		console.log("  POs       : 2   Journal entries: 4");
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
