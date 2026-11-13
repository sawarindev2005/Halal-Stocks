export const DISCLAIMER =
  'ข้อมูลอาจล่าช้า ไม่ใช่คำแนะนำการลงทุน ผู้ใช้ควรตรวจสอบสถานะชาริอะห์กับแหล่งที่เชื่อถือได้';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        <p>{DISCLAIMER}</p>
        <p className="mt-1">ข้อมูลราคาจาก Yahoo Finance</p>
      </div>
    </footer>
  );
}
