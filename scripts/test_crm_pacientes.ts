import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  console.log('Connecting to CRM database...');
  console.log('Host:', process.env.DB_HOST);
  console.log('Port:', process.env.DB_PORT);
  console.log('Database:', process.env.DB_DATABASE);

  const crmClient = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5511', 10),
    user: process.env.DB_USERNAME,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
  });

  try {
    await crmClient.connect();
    console.log('Successfully connected to CRM database!');

    // 1. Query c_oportunidad_cerradora
    console.log('Querying c_oportunidad_cerradora...');
    const opRes = await crmClient.query(`
      SELECT op.id, op.name, op.h_c_patient, op.cotizacion_id, op.contract_id, op.factura_id, op.created_at
      FROM c_oportunidad_cerradora op
      WHERE op.deleted = false
      ORDER BY op.created_at DESC
      LIMIT 20
    `);
    const entities = opRes.rows;
    console.log(`Found ${entities.length} entities in c_oportunidad_cerradora.`);

    if (entities.length > 0) {
      const quotationIds = entities.map(e => Number(e.cotizacion_id)).filter(id => id && !isNaN(id));
      const patientNames = entities.map(e => e.name).filter(Boolean);
      const contractIds = entities.map(e => e.contract_id).filter(id => id && /^\d+$/.test(id)).map(Number);
      const histories = entities.map(e => e.h_c_patient).filter(Boolean);

      console.log('Quotation IDs:', quotationIds);
      console.log('Patient Names:', patientNames);
      console.log('Contract IDs:', contractIds);
      console.log('Histories:', histories);

      // 2. Query crm_cerradora_solicitudes
      console.log('Querying crm_cerradora_solicitudes...');
      let solicitudes: any[] = [];
      if (quotationIds.length > 0 || patientNames.length > 0) {
        solicitudes = await crmClient.query(`
          SELECT id, quotation_id as "quotationId", paciente_nombre as "pacienteNombre", clinic_history_id as "clinicHistoryId", firma_contrato as "firmaContrato", facturado, estado, monto, tipo_contrato as "tipoContrato", fecha_contrato as "fechaContrato", created_at as "createdAt"
          FROM crm_cerradora_solicitudes
          WHERE quotation_id = ANY($1::int[]) OR paciente_nombre = ANY($2::varchar[])
          ORDER BY id DESC
        `, [
          quotationIds.length > 0 ? quotationIds : [-1],
          patientNames.length > 0 ? patientNames : ['']
        ]).then(res => res.rows);
      }
      console.log(`Found ${solicitudes.length} solicitudes.`);

      // 3. Query SV contracts
      console.log('Querying SV contracts database...');
      let svContracts: any[] = [];
      if (contractIds.length > 0 || histories.length > 0) {
        const svClient = new Client({
          host: process.env.SV_DB_HOST || '161.132.211.235',
          port: parseInt(process.env.SV_DB_PORT || '5501', 10),
          user: process.env.SV_DB_USERNAME || 'desarrollador_dev_maxillaris',
          database: process.env.SV_DB_DATABASE || 'sv_dev',
          password: process.env.SV_DB_PASSWORD || 'hq75TCdbiJzhfr7lXt3w',
        });

        try {
          await svClient.connect();
          const svRes = await svClient.query(`
            SELECT c.id as contract_id, c.idquotation as quotation_id, ch.history as clinic_history, c.signature, c.signaturefinger, c.amount, c.num, c.date
            FROM contract c
            INNER JOIN clinic_history ch ON c.idclinichistory = ch.id
            WHERE (c.id = ANY($1::int[]) OR ch.history = ANY($2::varchar[])) AND c.state = 1
          `, [
            contractIds.length > 0 ? contractIds : [-1],
            histories.length > 0 ? histories : ['']
          ]);
          svContracts = svRes.rows;
        } catch (err: any) {
          console.error('Error querying SV contracts:', err.message, err.stack);
        } finally {
          await svClient.end();
        }
      }
      console.log(`Found ${svContracts.length} SV contracts.`);

      const svContractsById = new Map<number, any>();
      const svContractsByHistory = new Map<string, any>();
      for (const row of svContracts) {
        if (row.contract_id) svContractsById.set(row.contract_id, row);
        if (row.clinic_history) svContractsByHistory.set(row.clinic_history, row);
      }

      console.log('Starting opportunities map simulation...');
      const opportunities = entities.map((entity, index) => {
        let isSigned = false;
        let contractId = entity.contract_id;
        let amount: number | null = null;
        let tipoContrato: string | null = null;
        let fechaContrato: Date | null = null;

        let svContract: any = null;
        if (entity.h_c_patient && svContractsByHistory.has(entity.h_c_patient)) {
          svContract = svContractsByHistory.get(entity.h_c_patient);
        } else if (entity.contract_id && /^\d+$/.test(entity.contract_id)) {
          const cId = parseInt(entity.contract_id, 10);
          if (svContractsById.has(cId)) {
            svContract = svContractsById.get(cId);
          }
        }

        if (svContract) {
          contractId = svContract.contract_id ? String(svContract.contract_id) : contractId;
          isSigned = (svContract.signature && svContract.signature.trim() !== '') ||
                     (svContract.signaturefinger && svContract.signaturefinger.trim() !== '');
          amount = svContract.amount ? Number(svContract.amount) : null;
          tipoContrato = svContract.num || null;
          fechaContrato = svContract.date ? new Date(svContract.date) : null;
        } else if (entity.contract_id && /^\d+$/.test(entity.contract_id)) {
          const cId = parseInt(entity.contract_id, 10);
          const matched = svContractsById.get(cId);
          if (matched) {
            isSigned = (matched.signature && matched.signature.trim() !== '') ||
                       (matched.signaturefinger && matched.signaturefinger.trim() !== '');
          }
        }

        let firmaContrato = isSigned ? 'firmado' : 'pendiente';
        let facturado = (entity.factura_id || svContract) ? true : false;
        let solicitudesPendientes = 0;
        let ultimaSolicitudId: number | null = null;

        const cotNum = entity.cotizacion_id ? Number(entity.cotizacion_id) : null;
        const patientNameNormalized = (entity.name || '').toLowerCase().trim();

        const matchedSolicitudes = solicitudes.filter(s => {
          if (cotNum && s.quotationId === cotNum) return true;
          if (patientNameNormalized && (s.pacienteNombre || '').toLowerCase().trim() === patientNameNormalized) return true;
          return false;
        });

        matchedSolicitudes.sort((a, b) => a.id - b.id);

        for (const s of matchedSolicitudes) {
          firmaContrato = s.firmaContrato ?? firmaContrato;
          facturado = s.facturado ?? facturado;
          amount = s.monto ? Number(s.monto) : amount;
          tipoContrato = s.tipoContrato ?? tipoContrato;
          fechaContrato = s.fechaContrato ? new Date(s.fechaContrato) : fechaContrato;
          if (s.estado === 'pendiente') {
            solicitudesPendientes += 1;
          }
          if (!ultimaSolicitudId || s.id > ultimaSolicitudId) {
            ultimaSolicitudId = s.id;
          }
        }

        return {
          id: entity.id,
          name: entity.name,
          firmaContrato,
          facturado,
          solicitudesPendientes,
          ultimaSolicitudId,
          monto: amount,
          tipoContrato,
          fechaContrato,
        };
      });

      console.log('Map simulation completed successfully! Sample item:', opportunities[0]);
    }
  } catch (err: any) {
    console.error('CRITICAL DIAGNOSTIC ERROR:', err.message, err.stack);
  } finally {
    await crmClient.end();
  }
}

run();
