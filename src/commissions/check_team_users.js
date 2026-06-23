const { Client } = require('pg');
async function queryData() {
  const config = {
    host: '161.132.199.230',
    port: 5432,
    user: 'postgres',
    password: '8Do$oO3&3gcD',
    database: 'crm'
  };
  const client = new Client(config);
  try {
    await client.connect();
    
    console.log("--- Check hermaioni.seijas records in PROD ---");
    const res = await client.query(`
      SELECT r.id, r.period_id, p.year, p.month, p.campus_id, r.user_id, r.user_name, r.monto_facturado_sin_igv, r.meta_monto_individual, r.comision_total, r.estado
      FROM commission_record r
      JOIN commission_period p ON r.period_id = p.id
      WHERE r.user_id = 'hermaioni.seijas'
      ORDER BY p.year DESC, p.month DESC, p.campus_id ASC;
    `);
    console.table(res.rows);

  } finally {
    await client.end();
  }
}
queryData().catch(console.error);
