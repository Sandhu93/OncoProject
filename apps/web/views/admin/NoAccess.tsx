/** Shown instead of a page the signed-in person has no permission to use. The API refuses it too. */
export default function NoAccess({ what }: { what: string }) {
  return (
    <p role="alert" className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
      You do not have permission to {what}. If you need it, ask the person who manages staff accounts.
    </p>
  );
}
