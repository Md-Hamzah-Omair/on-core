type OffscreenApi = {
  closeDocument?: () => Promise<void>;
};

type SendMessage = (message: unknown) => Promise<unknown>;
type ReportError = (error: unknown) => void;

export async function closeOffscreenDocument(
  offscreen: OffscreenApi | undefined,
  reportError: ReportError,
): Promise<void> {
  if (!offscreen?.closeDocument) return;

  try {
    await offscreen.closeDocument();
  } catch (error) {
    reportError(error);
  }
}

export async function requestOffscreenClose(
  sendMessage: SendMessage,
  reportError: ReportError,
): Promise<void> {
  try {
    await sendMessage({ type: 'CLOSE_OFFSCREEN_DOCUMENT', version: 1 });
  } catch (error) {
    reportError(error);
  }
}
