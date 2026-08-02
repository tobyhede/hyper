import { describe, expect, it } from 'vitest';
import { hasValidUniqueMediaTypeParameters } from '../src/media-type';

/**
 * Expected values come from RFC 9110's grammar, not from re-reading the scanner:
 *
 *   media-type      = type "/" subtype parameters
 *   parameter       = parameter-name "=" parameter-value
 *   parameter-value = ( token / quoted-string )
 *   quoted-string   = DQUOTE *( qdtext / quoted-pair ) DQUOTE
 *   qdtext          = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
 *   obs-text        = %x80-FF
 *   quoted-pair     = "\" ( HTAB / SP / VCHAR / obs-text )
 *   VCHAR           = %x21-7E
 *
 * The scanner is deliberately stricter than the grammar in one place: RFC 9110
 * writes parameters as `*( OWS ";" OWS [ parameter ] )`, so a trailing `;` with
 * no parameter is legal there and rejected here. This validates a *request*
 * header the caller then rewrites to canonical `application/json`, so refusing
 * an empty parameter is the safe direction. The case is pinned below.
 */
describe('hasValidUniqueMediaTypeParameters', () => {
  it.each([
    ['a bare media type', 'application/json'],
    ['a non-JSON bare media type', 'text/plain'],
    ['a token parameter value', 'application/json; charset=utf-8'],
    ['several distinct parameters', 'application/json; charset=utf-8; boundary=x'],
    ['a quoted parameter value', 'application/json; charset="utf-8"'],
    ['optional whitespace before the separator', 'application/json ; charset=utf-8'],
    ['optional whitespace around the equals', 'application/json; charset = utf-8'],
    ['tab as optional whitespace', 'application/json;\tcharset=utf-8'],
    ['distinct parameter names', 'a/b; c=D; e=F'],
  ])('accepts %s', (_name, value) => {
    expect(hasValidUniqueMediaTypeParameters(value)).toBe(true);
  });

  // The quoted-pair branch. No existing test carried a backslash, so every line
  // of the escape scanner was unexercised.
  it.each([
    ['an escaped DQUOTE', String.raw`application/json; foo="a\"b"`],
    ['an escaped backslash', String.raw`application/json; foo="a\\b"`],
    ['an escaped separator', String.raw`application/json; foo="a\;b"`],
    ['an escaped SP', String.raw`application/json; foo="a\ b"`],
    ['an escaped VCHAR at the lower bound', String.raw`application/json; foo="\!"`],
    ['an escaped VCHAR at the upper bound', String.raw`application/json; foo="\~"`],
    ['nothing but an escaped DQUOTE', String.raw`application/json; foo="\""`],
    ['an escaped HTAB', 'application/json; foo="a\\\tb"'],
    ['an escaped obs-text byte', 'application/json; foo="a\\ÿb"'],
    ['unescaped obs-text as qdtext', 'application/json; foo="aÿb"'],
    ['qdtext at the %x21 boundary', 'application/json; foo="!"'],
  ])('accepts a quoted value carrying %s', (_name, value) => {
    expect(hasValidUniqueMediaTypeParameters(value)).toBe(true);
  });

  it.each([
    ['an empty value', ''],
    ['a type with no slash', 'application'],
    ['a missing subtype', 'application/'],
    ['a missing type', '/json'],
    ['a slash with neither side', '/'],
    ['whitespace only', '   '],
    ['junk after the media type', 'application/json garbage'],
  ])('rejects %s', (_name, value) => {
    expect(hasValidUniqueMediaTypeParameters(value)).toBe(false);
  });

  it.each([
    ['duplicate parameter names', 'application/json; charset=utf-8; charset=utf-16'],
    ['duplicate names differing in case', 'application/json; charset=utf-8; CHARSET=utf-16'],
    ['a parameter with no equals', 'application/json; charset'],
    ['a parameter with no name', 'application/json; =utf-8'],
    ['an empty token parameter value', 'application/json; charset='],
    ['a trailing separator with no parameter', 'application/json;'],
    ['a separator with only whitespace after it', 'application/json; '],
    ['an unterminated quoted string', 'application/json; charset="utf-8'],
    ['an empty unterminated quoted string', 'application/json; charset="'],
    // Not String.raw: a trailing backslash would escape the closing backtick.
    ['a dangling escape at the end of input', 'application/json; foo="abc\\'],
  ])('rejects %s', (_name, value) => {
    expect(hasValidUniqueMediaTypeParameters(value)).toBe(false);
  });

  // quoted-pair admits HTAB, SP, VCHAR and obs-text and nothing else. qdtext
  // excludes the same bytes, and excludes DQUOTE and backslash besides, because
  // those start a terminator and an escape instead. Built by code point so no
  // control character has to survive a round trip through the source file.
  const invalidCodePoints: readonly (readonly [string, number])[] = [
    ['NUL', 0],
    ['LF', 10],
    ['US', 31],
    ['DEL', 127],
    ['a code point above obs-text', 256],
  ];

  it.each(invalidCodePoints)('rejects %s as an escaped byte', (_name, code) => {
    const value = `application/json; foo="a\\${String.fromCharCode(code)}b"`;
    expect(hasValidUniqueMediaTypeParameters(value)).toBe(false);
  });

  it.each(invalidCodePoints)('rejects %s as unescaped quoted text', (_name, code) => {
    const value = `application/json; foo="a${String.fromCharCode(code)}b"`;
    expect(hasValidUniqueMediaTypeParameters(value)).toBe(false);
  });
});
