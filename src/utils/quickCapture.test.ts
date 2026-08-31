import { describe, expect, it } from 'vitest';
import {
  CAPTURE_PROCESSED_TAG,
  CAPTURE_TAG,
  CAPTURE_UNPROCESSED_TAG,
  capturePlainText,
  captureContentHtml,
  captureTitleFromText,
  isCaptureBlock,
  isProcessedCapture
} from './quickCapture';

describe('captureTitleFromText', () => {
  it('takes the first line that has something on it', () => {
    expect(captureTitleFromText('\n\n  Call the supplier back  \nand ask about the invoice')).toBe('Call the supplier back');
  });

  it('shortens a long first line', () => {
    const title = captureTitleFromText('x'.repeat(200));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('falls back to a label when there is nothing to derive from', () => {
    expect(captureTitleFromText('   \n  ')).toBe('Capture');
  });
});

describe('captureContentHtml', () => {
  it('keeps the typed text verbatim, one paragraph per line', () => {
    expect(captureContentHtml('first\nsecond')).toBe('<p>first</p><p>second</p>');
  });

  it('keeps blank lines rather than collapsing them', () => {
    expect(captureContentHtml('a\n\nb')).toBe('<p>a</p><p><br></p><p>b</p>');
  });

  it('escapes markup so a capture cannot inject content', () => {
    expect(captureContentHtml('<script>alert("x")</script>')).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>'
    );
  });

  it('adds a project hint as its own line, after the text', () => {
    expect(captureContentHtml('idea', 'Acme')).toBe('<p>idea</p><p><em>Project hint: Acme</em></p>');
  });

  it('leaves the hint out when none was given', () => {
    expect(captureContentHtml('idea')).toBe('<p>idea</p>');
  });
});

describe('capturePlainText', () => {
  it('is the raw text when there is no hint', () => {
    expect(capturePlainText('idea')).toBe('idea');
  });

  it('appends the hint below the text', () => {
    expect(capturePlainText('idea', 'Acme')).toBe('idea\n\nProject hint: Acme');
  });
});

describe('capture state', () => {
  it('recognises a capture by its tag', () => {
    expect(isCaptureBlock({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG] })).toBe(true);
    expect(isCaptureBlock({ tags: ['idea'] })).toBe(false);
    expect(isCaptureBlock({ tags: undefined })).toBe(false);
  });

  it('counts an entry as processed only once an agent swapped the tag over', () => {
    expect(isProcessedCapture({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG] })).toBe(false);
    expect(isProcessedCapture({ tags: [CAPTURE_TAG, CAPTURE_PROCESSED_TAG] })).toBe(true);
  });

  it('leaves an ordinary block alone even if it carries the processed tag', () => {
    expect(isProcessedCapture({ tags: [CAPTURE_PROCESSED_TAG] })).toBe(false);
  });
});
