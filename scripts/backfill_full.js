const { windowDaysBack } = require('../src/utils/dates');
const syncSales = require('../src/jobs/sync_sales');

function toISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

(async () => {
  try {
    const today = new Date();
    let end = new Date(today);
    const stop = new Date('2018-01-01T00:00:00Z'); // adjust if your history is shorter
    const chunkDays = 90;

    while (end > stop) {
      const start = new Date(end);
      start.setDate(start.getDate() - (chunkDays - 1));
      if (start < stop) start.setTime(stop.getTime());

      const startStr = toISO(start);
      const endStr = toISO(end);
      console.log(`\n=== Backfill ${startStr} → ${endStr} ===`);
      process.argv = ['node', 'sync', `--start=${startStr}`, `--end=${endStr}`];
      await syncSales();

      // Move end back one day before the start
      end.setDate(start.getDate() - 1);
    }

    console.log('\n✅ Full backfill complete');
  } catch (e) {
    console.error('Backfill failed:', e.message);
    process.exit(1);
  }
})();
