const paths = {
  turbines: 'M12 21V12m0-2L9 3l1 7m3 1 8 2-7-4m-3 3-5 6 2-7',
  blades: 'M2 16C6 6 15 5 22 9 17 11 10 13 2 16Zm2-1 14-6',
  library: 'M3 5h4v14H3zm6 0h4v14H9zm6 1 4-1 3 13-4 1z',
  evidence: 'M5 3h10l4 4v5M5 3v17h7M9 7h4M9 11h3m6 7 3 3m-2-6a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',
  compare: 'M3 18V9h4v9zm7 0V4h4v14zm7 0v-7h4v7z',
  saved: 'M5 4h14v17l-7-5-7 5V4Z',
};
export function SectionIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
