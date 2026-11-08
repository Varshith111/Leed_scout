import { bootstrap } from '../src/cli/bootstrap';
import { EmailFinder } from '../src/verification/EmailFinder';
import { ExportService } from '../src/services/ExportService';
import { ExportFormat } from '../src/models/enums';
import { printSuccess, printKeyValue, printLine, printWarning } from '../src/cli/output';

interface LeadRow {
  id: number;
  name: string;
  city: string | null;
  email: string | null;
  website: string | null;
  rawWebsite?: string | null;
}

async function main() {
  const context = bootstrap();
  await context.database.initialize();

  const leads = await context.database.query<LeadRow>(
    `SELECT vb.id, vb.name, vb.city, vb.email, vb.website, rb.website as "rawWebsite"
       FROM "VerifiedBusinesses" vb
       LEFT JOIN "RawBusinesses" rb ON rb.id = vb."rawBusinessId"
      WHERE vb."hasWebsite" = FALSE
        AND (vb.email IS NULL OR vb.email = '')
      ORDER BY vb.id ASC`
  );

  printLine();
  printWarning(`Found ${leads.length} leads without email. Running EmailFinder discovery...`);
  printLine();

  const finder = new EmailFinder(
    context.config.verification.timeoutMs,
    context.config.verification.userAgent,
    context.logger,
  );

  let foundCount = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const targetUrl = lead.website || lead.rawWebsite;

    process.stdout.write(`[${i + 1}/${leads.length}] Checking ${lead.name} (${lead.city ?? ''})... `);
    const email = await finder.findEmail(lead.name, lead.city ?? '', targetUrl);

    if (email) {
      foundCount++;
      console.log(`FOUND: ${email}`);
      await context.database.execute(
        `UPDATE "VerifiedBusinesses" SET "email" = ? WHERE "id" = ?`,
        [email, lead.id]
      );
    } else {
      console.log('Not found');
    }
  }

  printLine();
  printSuccess(`Discovery complete! Found emails for ${foundCount} of ${leads.length} leads.`);

  // Auto-export updated leads
  printLine();
  printWarning('Exporting freshly updated leads to Excel, CSV, and JSON...');
  const exporter = new ExportService(context.database, context.logger);

  const excelResult = await exporter.run({
    format: ExportFormat.EXCEL,
    outputDir: context.config.paths.output,
  });
  const csvResult = await exporter.run({
    format: ExportFormat.CSV,
    outputDir: context.config.paths.output,
  });
  const jsonResult = await exporter.run({
    format: ExportFormat.JSON,
    outputDir: context.config.paths.output,
  });

  printLine();
  printSuccess('Exports ready:');
  printKeyValue('Excel File (.xlsx)', excelResult.filePath);
  printKeyValue('CSV File (.csv)', csvResult.filePath);
  printKeyValue('JSON File (.json)', jsonResult.filePath);

  await context.database.close();
}

main().catch(console.error);

