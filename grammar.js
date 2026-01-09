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

    /**
     * Declarations
     */
    _declaration: ($) => choice($.enum_item, $.model_item, $.view_item),

    //
    // Enum
    //

    enum_item: ($) =>
      seq(
        optional($.visibility_modifier),
        "enum",
        field("name", $.identifier),
        field("body", $.enum_body),
      ),

    enum_body: ($) => seq("{", sep1($.enum_member, ","), "}"),

    enum_member: ($) => choice($._implicit_enum_member, $._backed_enum_member),

    _implicit_enum_member: ($) => seq(field("name", $._field_identifier), ","),

    _backed_enum_member: ($) =>
      seq(
        field("name", $._field_identifier),
        token(":"),
        field("value", choice($.number, $.string)),
        ",",
      ),

    //
    // Model
    //

    // TODO: it would be nice to drop the requirement for ":" and "," separators
    // For example:
    // model Example {
    //    field_one String
    //    field_two String
    // }

    // TODO: define syntax for function types. For example:
    // model User {
    //    first_name String
    //    last_name String
    //    name: () -> String
    //    initials: (onlyFirstName: Boolean) -> String
    // }
    // Do I need to care about async?

    model_item: ($) =>
      seq(
        optional($.visibility_modifier),
        "model",
        field("name", $.identifier),
        field("body", $.model_body),
      ),

    model_body: ($) => seq("{", sep1($.model_field, ","), optional(","), "}"),

    model_field: ($) =>
      seq(
        field("name", $._field_identifier),
        token.immediate(":"),
        field("type", $._type_identifier),
      ),

    //
    // Views
    //

    view_item: ($) =>
      seq(
        optional($.visibility_modifier),
        "view",
        field("name", $.identifier),
        optional(choice(field("params", $.view_parameters), seq("(", ")"))),
        field("body", $.view_body),
      ),

    // View are a variant of a function parameter list where there
    // is only ever one parameter
    view_parameters: ($) =>
      seq(
        "(",
        field("props", $.identifier),
        token.immediate(":"),
        field("type", $._type_identifier),
        ")",
      ),

    // TODO: A view body contains html-like syntax with @directives and {expressions}
    view_body: ($) => seq("{", "}"),

    // parameter_list: ($) =>
    //   seq(
    //     "(",
    //     optional(
    //       seq(
    //         commaSep(
    //           choice($.parameter_declaration, $.variadic_parameter_declaration),
    //         ),
    //         optional(","),
    //       ),
    //     ),
    //     ")",
    //   ),

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
