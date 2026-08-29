import { describe, expect, it } from 'vitest';

import { contentToHtml, looksLikeHtml, sanitizeHtml } from './html.mjs';
import { contentStatsFromHtml, markdownToHtml } from './markdown.mjs';

/**
 * Agents write in whichever format they last read. DeepScribe answers in HTML,
 * so both formats arrive here. The sniffer decides which route a string takes;
 * the sanitiser is what keeps the HTML route from becoming an injection hole.
 */
describe('format detection', () => {
  it('routes stored HTML through the HTML path', () => {
    expect(looksLikeHtml('<h2>Doel</h2><p>Inhoud</p>')).toBe(true);
    expect(looksLikeHtml('<p>Eén alinea.</p>')).toBe(true);
    expect(looksLikeHtml('<ul><li><p>een</p></li></ul>')).toBe(true);
    expect(looksLikeHtml('<hr>')).toBe(true);
  });

  it('leaves Markdown, mixed content and prose on the Markdown path', () => {
    expect(looksLikeHtml('## Doel\n\n- een\n- twee')).toBe(false);
    expect(looksLikeHtml('**Status:** <script>alert(1)</script> en [bron](https://example.com).')).toBe(false);
    expect(looksLikeHtml('<p>intro</p>\n\n- een\n- twee')).toBe(false);
    expect(looksLikeHtml('a < b en c > d')).toBe(false);
    expect(looksLikeHtml('<3 mensen kwamen langs')).toBe(false);
    expect(looksLikeHtml('')).toBe(false);
  });
});

describe('agent content conversion', () => {
  it('keeps Markdown conversion byte for byte', () => {
    const samples = [
      '## Te bepalen\n\n- Naam\n- Geschiedenis\n\n1. Eerste\n2. Tweede',
      'Beschrijving.\n\n\n‘Gesproken tekst.’',
      '**Status:** <script>alert(1)</script> en [bron](https://example.com).',
      'a < b en c > d',
      ''
    ];
    for (const sample of samples) expect(contentToHtml(sample)).toBe(markdownToHtml(sample));
  });

  it('turns supplied HTML into real nodes instead of visible tags', () => {
    const html = contentToHtml('<h2>Doel</h2><p>Inhoud</p>');
    expect(html).toBe('<h2>Doel</h2><p>Inhoud</p>');
    expect(html).not.toContain('&lt;');
    expect(html).not.toContain('&gt;');
  });

  it('escapes a stray angle bracket in prose rather than reading it as a tag', () => {
    expect(contentToHtml('a < b en c > d')).toBe('<p>a &lt; b en c &gt; d</p>');
  });

  it('keeps the tags the editor can store', () => {
    expect(contentToHtml('<p><strong>vet</strong> <em>schuin</em> <s>weg</s> <code>code</code></p>'))
      .toBe('<p><strong>vet</strong> <em>schuin</em> <s>weg</s> <code>code</code></p>');
    expect(contentToHtml('<ol start="3"><li><p>derde</p></li></ol>'))
      .toBe('<ol start="3"><li><p>derde</p></li></ol>');
    expect(contentToHtml('<table><tbody><tr><th colspan="2">A</th></tr><tr><td>B</td><td>C</td></tr></tbody></table>'))
      .toBe('<table><tbody><tr><th colspan="2">A</th></tr><tr><td>B</td><td>C</td></tr></tbody></table>');
    expect(contentToHtml('<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>'))
      .toBe('<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>');
    expect(contentToHtml('<p><a href="https://example.com" title="Bron">bron</a></p>'))
      .toBe('<p><a href="https://example.com" title="Bron">bron</a></p>');
  });

  it('unwraps unknown tags but keeps their text', () => {
    expect(contentToHtml('<div><span>tekst</span></div>')).toBe('tekst');
    expect(contentToHtml('<section><p>bewaard</p></section>')).toBe('<p>bewaard</p>');
  });

  it('closes what an agent left open and never returns nothing', () => {
    expect(sanitizeHtml('<p>los')).toBe('<p>los</p>');
    expect(sanitizeHtml('<div></div>')).toBe('<p></p>');
  });
});

/**
 * One case per construction the allowlist has to refuse. Escaping used to do
 * this job for free; now it is the sanitiser's, so each one is pinned.
 */
describe('constructions an agent cannot smuggle in', () => {
  it('removes a script together with its code', () => {
    const html = contentToHtml('<p>Hoi<script>alert(1)</script>daar</p>');
    expect(html).toBe('<p>Hoidaar</p>');
    expect(html).not.toContain('alert');
  });

  it('removes a style block', () => {
    expect(contentToHtml('<p>rood</p><style>p{color:red}</style>')).toBe('<p>rood</p>');
  });

  it('removes an iframe but keeps the surrounding text', () => {
    expect(contentToHtml('<div><iframe src="https://evil.example"></iframe><p>blijft</p></div>')).toBe('<p>blijft</p>');
  });

  it('drops every event handler', () => {
    const html = contentToHtml('<p onclick="steal()"><img src="https://example.com/a.png" onerror="alert(1)"></p>');
    expect(html).toBe('<p><img src="https://example.com/a.png"></p>');
    expect(html).not.toMatch(/on[a-z]+=/i);
  });

  it('drops a javascript: link, entity-encoded or not', () => {
    expect(contentToHtml('<p><a href="javascript:alert(1)">x</a></p>')).toBe('<p><a>x</a></p>');
    expect(contentToHtml('<p><a href="java&#115;cript:alert(1)">x</a></p>')).toBe('<p><a>x</a></p>');
    expect(contentToHtml('<p><a href="JaVaScRiPt:alert(1)">x</a></p>')).toBe('<p><a>x</a></p>');
  });

  it('drops a data: source', () => {
    expect(contentToHtml('<p><img src="data:text/html;base64,PHNjcmlwdD4="></p>')).toBe('<p></p>');
    expect(contentToHtml('<p><a href="data:text/html,<script>alert(1)</script>">x</a></p>')).toBe('<p><a>x</a></p>');
  });

  it('drops an inline style attribute', () => {
    expect(contentToHtml('<p style="position:fixed;top:0">rood</p>')).toBe('<p>rood</p>');
  });

  it('drops svg and its payload', () => {
    expect(contentToHtml('<p>a<svg><script>alert(1)</script></svg>b</p>')).toBe('<p>ab</p>');
  });

  it('cannot create an inline todo through HTML', () => {
    const html = contentToHtml('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Klaar</p></div></li></ul>');
    expect(html).toBe('<ul><li><p>Klaar</p></li></ul>');
    expect(html).not.toContain('taskItem');
    expect(contentStatsFromHtml(html).taskCount).toBe(0);
  });
});

describe('stored statistics after the HTML route', () => {
  it('counts no tasks and reads the text of directly supplied HTML', () => {
    const stats = contentStatsFromHtml(contentToHtml('<h2>Doel</h2><p>Inhoud met <strong>nadruk</strong>.</p>'));
    expect(stats.content).toBe('<h2>Doel</h2><p>Inhoud met <strong>nadruk</strong>.</p>');
    expect(stats.plainText).toBe('Doel Inhoud met nadruk .');
    expect(stats.taskCount).toBe(0);
    expect(stats.completedTaskCount).toBe(0);
  });

  it('reports the same figures for the Markdown and the HTML spelling of one list', () => {
    const fromMarkdown = contentStatsFromHtml(contentToHtml('- een\n- twee'));
    const fromHtml = contentStatsFromHtml(contentToHtml('<ul><li><p>een</p></li><li><p>twee</p></li></ul>'));
    expect(fromHtml.content).toBe(fromMarkdown.content);
    expect(fromHtml.plainText).toBe(fromMarkdown.plainText);
    expect(fromHtml.taskCount).toBe(fromMarkdown.taskCount);
  });
});
