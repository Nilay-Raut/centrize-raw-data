/**
 * csv-parse.worker.ts — Web Worker for metadata extraction (CSV & XLSX).
 *
 * This worker extracts headers and a 5-row preview without blocking the UI.
 * For CSV: Receives a partial string (first 1MB).
 * For XLSX: Receives an ArrayBuffer and uses the 'xlsx' library.
 */

/// <reference lib="webworker" />

addEventListener('message', async ({ data }: MessageEvent<{ 
  type: 'csv' | 'xlsx'; 
  content: string | ArrayBuffer 
}>) => {
  try {
    if (data.type === 'xlsx') {
      const { read, utils } = await import('xlsx');
      const workbook = read(data.content, { type: 'array', sheetRows: 10 }); // only read first few rows
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('Empty Excel file');
      
      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) throw new Error('Could not read the first sheet');
      
      const rows = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      if (!rows || rows.length === 0) throw new Error('No data in Excel sheet');

      const headers = (rows[0] || []).map(h => String(h).trim()).filter(Boolean);
      const preview: Record<string, string>[] = [];
      
      for (let i = 1; i < Math.min(rows.length, 6); i++) {
        const rowData: Record<string, string> = {};
        const currentRow = rows[i] || [];
        headers.forEach((h, idx) => {
          rowData[h] = currentRow[idx] != null ? String(currentRow[idx]) : '';
        });
        preview.push(rowData);
      }

      postMessage({ headers, preview });
    } else {
      // CSV Logic — optimized to only parse the first few rows of the provided text
      const csvText = data.content as string;
      const lines = csvText.split(/\r?\n/);
      
      if (lines.length === 0) {
        postMessage({ headers: [], preview: [] });
        return;
      }

      const headers = parseCsvLine(lines[0] ?? '');
      const preview: Record<string, string>[] = [];

      const previewEnd = Math.min(lines.length, 6);
      for (let i = 1; i < previewEnd; i++) {
        const line = lines[i] ?? '';
        if (!line.trim()) continue;
        const values = parseCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? '';
        });
        preview.push(row);
      }

      postMessage({ headers, preview });
    }
  } catch (error: any) {
    postMessage({ error: error.message || 'Parsing failed' });
  }
});

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
