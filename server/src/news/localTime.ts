/** วันที่และเวลาตามเขตเวลาที่กำหนด (เช่น Asia/Bangkok) ไม่ว่าเครื่องจะตั้งเวลาเป็นเขตไหน */
export function localDateTime(date: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    /** YYYY-MM-DD */
    date: `${parts.year}-${parts.month}-${parts.day}`,
    /** นาทีนับจากเที่ยงคืน เช่น 07:30 = 450 */
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
