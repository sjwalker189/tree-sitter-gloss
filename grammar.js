/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  COMMENT: 1, // Prefer comments over regexes
  STRING: 2, // In a string, prefer string characters over comments
  ASSIGN: 0,
  TERNARY: 1,
  OR: 2,
  AND: 3,
  REL: 4,
  PLUS: 5,
  TIMES: 6,
  EXP: 7,
  CALL: 8,
  MEMBER: 9,
};

module.exports = grammar({
  name: "gloss",

  extras: ($) => [$.comment, /\s/],

  inline: ($) => [],

  word: ($) => $.identifier,

  conflicts: ($) => [],

  supertypes: ($) => [],

  rules: {
    source_file: ($) => seq(repeat(choice($.comment, $.developer_comment))),
    //
    // Comments
    developer_comment: ($) => token(seq("//", /[^/].*/)),
    comment: ($) => prec(PREC.COMMENT, token(seq("///", /.*/))),

    identifier: (_) => /[_\p{XID_Start}][_\p{XID_Continue}]*/,
    // identifier: ($) => {
    //   const alpha =
    //     /[^\x00-\x1F\s\p{Zs}0-9:;`"'@#.,|^&<=>+*/\\%?!~()\[\]{}\uFEFF\u2060\u200B]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
    //   const alphanumeric =
    //     /[^\x00-\x1F\s\p{Zs}:;`"'@#.,|^&<=>+*/\\%?!~()\[\]{}\uFEFF\u2060\u200B]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
    //   return token(seq(alpha, repeat(alphanumeric)));
    // },

    // _type_identifier: ($) => alias($.identifier, $.type_identifier),
    // _field_identifier: ($) => alias($.identifier, $.field_identifier),
    // _package_identifier: ($) => alias($.identifier, $.package_identifier),

    // Builtin primitive types
    number: ($) => /\d+/,
    string: ($) =>
      token(
        choice(
          seq("'", /([^'\n]|\\(.|\n))*/, "'"),
          seq('"', /([^"\n]|\\(.|\n))*/, '"'),
        ),
      ),
    true: ($) => "true",
    false: ($) => "false",
    nil: ($) => "nil",
  },
});

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`
 *
 * @param {RuleOrLiteral} rule
 *
 * @param {RuleOrLiteral} separator
 *
 * @returns {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @returns {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}
