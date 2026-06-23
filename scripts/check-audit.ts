import { Client } from 'pg';

async function main() {
  const client = new Client({
    host: '161.132.199.230',
    port: 5432,
    user: 'postgres',
    password: '8Do$oO3&3gcD',
    database: 'maxi_dev',
  });

  try {
    await client.connect();
    console.log('Connected to database!');

    const res = await client.query(`
      SELECT *
      FROM audit
      WHERE title IN ('contract', 'Contract')
      ORDER BY idaudit DESC
      LIMIT 30;
    `);
    console.log(res.rows);
    console.log('=== SERVICE ORDER AUDIT ROWS ===');
    console.log(res.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
