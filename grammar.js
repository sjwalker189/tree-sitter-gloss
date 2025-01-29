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

  supertypes: ($) => [$._declaration],

  rules: {
    source_file: ($) =>
      seq(repeat(choice($.comment, $.developer_comment, $._declaration))),

    // Comments
    developer_comment: ($) => token(seq("//", /[^/].*/)),
    comment: ($) => prec(PREC.COMMENT, token(seq("///", /.*/))),

    // Identifiers
    identifier: (_) => /[_\p{XID_Start}][_\p{XID_Continue}]*/,
    _type_identifier: ($) => alias($.identifier, $.type_identifier),
    _field_identifier: ($) => alias($.identifier, $.field_identifier),

    // Package System
    visibility_modifier: (_) => "pub",

    // Declarations
    _declaration: ($) => choice($.enum_item),

    enum_item: ($) =>
      seq(
        optional($.visibility_modifier),
        "enum",
        field("name", $.identifier),
        field("body", $.enum_body),
      ),

    enum_body: ($) => seq("{", repeat($.enum_member), "}"),

    enum_member: ($) => choice($._implicit_enum_member, $._backed_enum_member),

    _implicit_enum_member: ($) => seq(field("name", $._field_identifier), ","),

    _backed_enum_member: ($) =>
      seq(
        field("name", $._field_identifier),
        token(":"),
        field("value", choice($.number, $.string)),
        ",",
      ),

    // Builtin primitive types
    number: (_) => /\d+/,
    string: (_) =>
      token(
        choice(
          seq("'", /([^'\n]|\\(.|\n))*/, "'"),
          seq('"', /([^"\n]|\\(.|\n))*/, '"'),
        ),
      ),
    true: (_) => "true",
    false: (_) => "false",
    nil: (_) => "nil",
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
