/** What the author is told when the link did not reach the clipboard. */
export const CLIPBOARD_REFUSAL = 'The browser refused clipboard access.';

/** Just enough of `Clipboard` to write one link, and honestly optional. */
interface ClipboardHost {
  readonly clipboard?: Pick<Clipboard, 'writeText'> | undefined;
}

/**
 * Read the Clipboard API off a host that may not have one.
 *
 * The DOM lib types `Navigator.clipboard` as always present, which is not true:
 * it is undefined outside a secure context. Restating the capability as
 * optional is what lets the check below be a real question rather than one the
 * compiler believes it has already answered — and `Navigator` satisfies this
 * shape, so nothing has to be asserted to ask it.
 */
const clipboardOf = (host: ClipboardHost): Pick<Clipboard, 'writeText'> | undefined =>
  host.clipboard;

/**
 * Write one link to the clipboard, answering the refusal rather than throwing.
 *
 * Both ways this fails are the author's to see, and only one of them is a
 * rejected promise. Outside a secure context — a dev server reached over a LAN
 * address rather than `localhost` — reading `.writeText` off a missing
 * clipboard throws *synchronously*, before there is a promise for a `.catch` to
 * attach to. A caller that only handled the rejection lost that one past its own
 * handler and into the event handler it was called from, where no error boundary
 * catches it and the refusal it meant to show never rendered. Answering the
 * message instead of throwing is what leaves one path for both.
 */
export async function copyLink(href: string): Promise<string | null> {
  const clipboard = clipboardOf(navigator);
  if (clipboard === undefined) return CLIPBOARD_REFUSAL;
  try {
    await clipboard.writeText(href);
    return null;
  } catch {
    return CLIPBOARD_REFUSAL;
  }
}
