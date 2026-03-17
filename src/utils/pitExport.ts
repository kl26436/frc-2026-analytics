import type { PitScoutEntry } from '../types/pitScouting';

/** Export pit scout entries as CSV with key strategy columns */
export function exportPitScoutCSV(entries: PitScoutEntry[], eventCode: string): void {
  const header = 'Team Number,Drive Train Type,Coach Name,Under Trench';
  const rows = entries
    .filter(e => e.teamNumber > 0)
    .sort((a, b) => a.teamNumber - b.teamNumber)
    .map(e => {
      const driveType = e.driveType ?? 'unknown';
      const coachName = csvEscape(e.coachName || '');
      const underTrench = e.canGoUnderTrench ? 'Yes' : 'No';
      return `${e.teamNumber},${driveType},${coachName},${underTrench}`;
    });

  const csv = [header, ...rows].join('\n');
  downloadBlob(csv, `pit-scouting-${eventCode}.csv`, 'text/csv');
}

/** Open a print-friendly table view for PDF export */
export function printPitScoutTable(entries: PitScoutEntry[], eventCode: string): void {
  const sorted = entries.filter(e => e.teamNumber > 0).sort((a, b) => a.teamNumber - b.teamNumber);

  const rows = sorted.map(e => `
    <tr>
      <td>${e.teamNumber}</td>
      <td>${e.driveType ?? 'unknown'}</td>
      <td>${escapeHtml(e.coachName || '-')}</td>
      <td>${e.canGoUnderTrench ? 'Yes' : 'No'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><title>Pit Scouting - ${eventCode}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #333; padding: 6px 10px; text-align: left; }
  th { background: #222; color: #fff; }
  tr:nth-child(even) { background: #f5f5f5; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>Pit Scouting Report \u2014 ${eventCode}</h1>
  <table>
    <thead><tr><th>Team #</th><th>Drive Train</th><th>Coach</th><th>Under Trench</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
