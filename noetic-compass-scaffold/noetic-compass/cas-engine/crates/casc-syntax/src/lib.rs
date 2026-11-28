use std::fs;
use std::path::Path;

use serde::Serialize;
use thiserror::Error;

pub const CAS_GRAMMAR_BNF: &str = r#"<program>          ::= <statement> (";" <statement>)* ;
<statement>        ::= <export_stmt> | <let_stmt> | <fn_stmt> | <use_stmt> | <expression> ;
<export_stmt>      ::= "export" (<let_stmt> | <fn_stmt>) ;
<let_stmt>         ::= "let" <ident> (":" <type_expr>)? "=" <expression> ;
<fn_stmt>          ::= "fn" <ident> "(" <typed_param_list>? ")" (":" <type_expr>)? "=" <expression> ;
<use_stmt>         ::= "use" <string> ;
<typed_param_list> ::= <typed_param> ("," <typed_param>)* ;
<typed_param>      ::= <ident> (":" <type_expr>)? ;
<type_expr>        ::= <type_name> ("[" <domain_list> "]")? ;
<type_name>        ::= "state" | "drive" | "string" | "fractal" | "rpm" | "relation" | "program" | "number" | "meta_set" | "meta_symbol" | "meta_assertion" | "any" ;
<domain_list>      ::= <domain> ("," <domain>)* ;
<expression>       ::= <meta_relation> ;
<meta_relation>    ::= <relation> (("∈" | "∉" | "⊂" | "⊆" | "⊃" | "⊇") <relation>)* ;
<relation>         ::= <composition> (("->") <composition>)* ;
<composition>      ::= <primary> (("*" | "/" | "circ") <primary>)* ;
<primary>          ::= <state> | <state_ref> | <drive_ref> | <rpm_call> | <phi_literal> | <cardinality> | <meta_set> | <meta_symbol> | "∅" | <number> | <call> | <ident> | <string> | "(" <expression> ")" ;
<cardinality>      ::= "|" <meta_set> "|" ;
<meta_set>         ::= "Noetics" | "Domains" | "Drives" | "Registers" | "States" | "Foundations" | "SubFoundations" | "Foundation_1" | ... | "Foundation_7" ;
<meta_symbol>      ::= <domain> | "T" | "A" | "f" | "E" ;
<call>             ::= <ident> "(" <arg_list>? ")" ;
<arg_list>         ::= <expression> ("," <expression>)* ;
<rpm_call>         ::= "RPM" "(" (<state> | <state_ref> | <drive_ref>) ")" ;
<phi_literal>      ::= ("Phi" | "Φ") ("<" | "⟨") <sequence> (">" | "⟩") ;
<sequence>         ::= <digit> (":" <digit>)* ;
<state>            ::= <operator> "^" <domain> ("_{" <drive_ref> "}")? ;
<state_ref>        ::= <domain> <digit> ;
<operator>         ::= "CO-" <digit> ;
<drive_ref>        ::= "F" <drive_digit> ;"#;

/// Maximum decimal digit count permitted for integer literals (covers full signed 64-bit range).
pub const MAX_INT_DIGITS: usize = 20;
/// Maximum decimal digit count permitted for small bounded indices (operators, drives, fractals).
pub const MAX_SMALL_INDEX_DIGITS: usize = 3;
/// Maximum nesting depth permitted during recursive parsing to prevent stack overflow.
pub const MAX_PARSE_DEPTH: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    Lexing,
    Parsing,
    Typecheck,
    Lowering,
    Execution,
}

impl Stage {
    fn as_str(self) -> &'static str {
        match self {
            Self::Lexing => "lexing",
            Self::Parsing => "parsing",
            Self::Typecheck => "typecheck",
            Self::Lowering => "lowering",
            Self::Execution => "execution",
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
#[error("{stage}{position}: {message}")]
pub struct LanguageError {
    stage: &'static str,
    position: String,
    offset: Option<usize>,
    message: String,
}

impl LanguageError {
    pub fn new(stage: Stage, message: impl Into<String>, position: Option<usize>) -> Self {
        Self {
            stage: stage.as_str(),
            position: position.map(|p| format!("@{p}")).unwrap_or_default(),
            offset: position,
            message: message.into(),
        }
    }

    pub fn stage_label(&self) -> &'static str {
        self.stage
    }

    pub fn position_offset(&self) -> Option<usize> {
        self.offset
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum TokenKind {
    Export,
    Let,
    Fn,
    Use,
    Co,
    StateRef,
    Domain,
    Drive,
    Rpm,
    Phi,
    Ident,
    String,
    Number,
    Arrow,
    Member,
    NotMember,
    Subset,
    SubsetEq,
    Superset,
    SupersetEq,
    EmptySet,
    Times,
    Divide,
    Circ,
    Caret,
    Underscore,
    LBrace,
    RBrace,
    LParen,
    RParen,
    LBracket,
    RBracket,
    LAngle,
    RAngle,
    Pipe,
    Colon,
    Comma,
    Equals,
    Semi,
    Eof,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LexToken {
    pub kind: TokenKind,
    pub value: String,
    pub position: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TypeKind {
    Any,
    State,
    Drive,
    String,
    Fractal,
    Rpm,
    Relation,
    Program,
    Number,
    MetaSet,
    MetaSymbol,
    MetaAssertion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TypeInfo {
    pub kind: TypeKind,
    pub domains: Vec<String>,
    pub singular: bool,
}

impl TypeInfo {
    pub fn new(kind: TypeKind, domains: Vec<String>, singular: bool) -> Self {
        Self {
            kind,
            domains,
            singular,
        }
    }

    pub fn any() -> Self {
        Self::new(TypeKind::Any, Vec::new(), false)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LetStatement {
    pub name: String,
    pub annotation: Option<TypeInfo>,
    pub expr: Box<AstNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FunctionDef {
    pub name: String,
    pub params: Vec<String>,
    pub param_types: Vec<TypeInfo>,
    pub return_type: Option<TypeInfo>,
    pub body: Box<AstNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UseStatement {
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExportStatement {
    pub statement: Box<AstNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum BinaryOp {
    Arrow,
    Times,
    Divide,
    Circ,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum MetaOp {
    Member,
    NotMember,
    Subset,
    SubsetEq,
    Superset,
    SupersetEq,
    Equals,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "node")]
pub enum AstNode {
    StateLiteral {
        operator: u8,
        domain: String,
        drive: Option<u8>,
        domain_explicit: bool,
    },
    DriveLiteral {
        drive: u8,
    },
    FractalLiteral {
        sequence: Vec<u8>,
    },
    RpmCall {
        expr: Box<AstNode>,
    },
    Identifier {
        name: String,
    },
    StringLiteral {
        value: String,
    },
    NumberLiteral {
        value: i64,
    },
    MetaSetLiteral {
        name: String,
    },
    MetaSymbol {
        name: String,
        symbol_kind: String,
    },
    EmptySetLiteral,
    CardinalityExpr {
        collection: Box<AstNode>,
    },
    MetaAssertion {
        op: MetaOp,
        left: Box<AstNode>,
        right: Box<AstNode>,
    },
    CallExpr {
        callee: String,
        args: Vec<AstNode>,
    },
    BinaryExpr {
        op: BinaryOp,
        left: Box<AstNode>,
        right: Box<AstNode>,
    },
    LetStatement(LetStatement),
    FunctionDef(FunctionDef),
    UseStatement(UseStatement),
    ExportStatement(ExportStatement),
    Program {
        statements: Vec<AstNode>,
    },
}

fn decode_string_literal(raw: &str, position: usize) -> Result<String, LanguageError> {
    let body = raw
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .ok_or_else(|| {
            LanguageError::new(Stage::Parsing, "malformed string literal", Some(position))
        })?;
    Ok(body
        .replace("\\\"", "\"")
        .replace("\\\\", "\\")
        .replace("\\n", "\n")
        .replace("\\t", "\t"))
}

fn decode_path_literal(raw: &str, position: usize) -> Result<String, LanguageError> {
    let body = raw
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .ok_or_else(|| {
            LanguageError::new(Stage::Parsing, "malformed path literal", Some(position))
        })?;
    Ok(body.replace("\\\"", "\"").replace("\\\\", "\\"))
}

fn type_keyword_to_kind(name: &str, position: usize) -> Result<TypeKind, LanguageError> {
    match name {
        "any" => Ok(TypeKind::Any),
        "state" => Ok(TypeKind::State),
        "drive" => Ok(TypeKind::Drive),
        "string" => Ok(TypeKind::String),
        "fractal" => Ok(TypeKind::Fractal),
        "rpm" => Ok(TypeKind::Rpm),
        "relation" => Ok(TypeKind::Relation),
        "program" => Ok(TypeKind::Program),
        "number" => Ok(TypeKind::Number),
        "meta_set" => Ok(TypeKind::MetaSet),
        "meta_symbol" => Ok(TypeKind::MetaSymbol),
        "meta_assertion" => Ok(TypeKind::MetaAssertion),
        _ => Err(LanguageError::new(
            Stage::Parsing,
            format!("unknown type {name}"),
            Some(position),
        )),
    }
}

fn canonical_meta_set_name(name: &str) -> Option<&'static str> {
    match name {
        "Noetics" => Some("Noetics"),
        "Domains" => Some("Domains"),
        "Drives" => Some("Drives"),
        "Registers" => Some("Registers"),
        "States" => Some("States"),
        "Foundations" => Some("Foundations"),
        "SubFoundations" | "DriveRegisterPositions" | "SubFoundationPositions" => {
            Some("SubFoundations")
        }
        "Foundation_1" => Some("Foundation_1"),
        "Foundation_2" => Some("Foundation_2"),
        "Foundation_3" => Some("Foundation_3"),
        "Foundation_4" => Some("Foundation_4"),
        "Foundation_5" => Some("Foundation_5"),
        "Foundation_6" => Some("Foundation_6"),
        "Foundation_7" => Some("Foundation_7"),
        "EmptySet" => Some("EmptySet"),
        _ => None,
    }
}

fn truncate_token_preview(token: &str, max_chars: usize) -> String {
    let mut chars = token.chars();
    let preview: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{preview}...")
    } else {
        preview
    }
}

fn parse_operator_digits(
    digits: &str,
    token_display: &str,
    position: usize,
) -> Result<u8, LanguageError> {
    let preview = truncate_token_preview(token_display, 24);
    if digits.is_empty()
        || digits.len() > MAX_SMALL_INDEX_DIGITS
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("invalid operator index in `{preview}`; allowed range is 0..=9"),
            Some(position),
        ));
    }
    let value = digits.parse::<u8>().map_err(|_| {
        LanguageError::new(
            Stage::Parsing,
            format!("operator index in `{preview}` overflows u8; allowed range is 0..=9"),
            Some(position),
        )
    })?;
    if value > 9 {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("operator index `{value}` in `{preview}` is out of range; allowed range is 0..=9"),
            Some(position),
        ));
    }
    Ok(value)
}

fn parse_co_operator(value: &str, position: usize) -> Result<u8, LanguageError> {
    let digits = value.strip_prefix("CO-").ok_or_else(|| {
        LanguageError::new(
            Stage::Parsing,
            format!(
                "malformed operator token `{}`; allowed range is CO-0..=CO-9",
                truncate_token_preview(value, 24)
            ),
            Some(position),
        )
    })?;
    parse_operator_digits(digits, value, position)
}

fn parse_state_ref(value: &str, position: usize) -> Result<(String, u8), LanguageError> {
    let mut chars = value.chars();
    let Some(domain_ch) = chars.next() else {
        return Err(LanguageError::new(
            Stage::Parsing,
            "malformed state reference token",
            Some(position),
        ));
    };
    if !matches!(domain_ch, 'P' | 'C' | 'E' | 'O') {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("invalid state domain `{domain_ch}`; allowed domains are P, C, E, O"),
            Some(position),
        ));
    }
    let operator = parse_operator_digits(chars.as_str(), value, position)?;
    Ok((domain_ch.to_string(), operator))
}

fn parse_fractal_element(digits: &str, position: usize) -> Result<u8, LanguageError> {
    let preview = truncate_token_preview(digits, 24);
    if digits.is_empty()
        || digits.len() > MAX_SMALL_INDEX_DIGITS
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("invalid fractal operator index `{preview}`; allowed range is 0..=9"),
            Some(position),
        ));
    }
    let value = digits.parse::<u8>().map_err(|_| {
        LanguageError::new(
            Stage::Parsing,
            format!("fractal operator index `{preview}` overflows u8; allowed range is 0..=9"),
            Some(position),
        )
    })?;
    if value > 9 {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("fractal operator index `{value}` is out of range; allowed range is 0..=9"),
            Some(position),
        ));
    }
    Ok(value)
}

fn parse_drive_token_value(value: &str, position: usize) -> Result<u8, LanguageError> {
    let preview = truncate_token_preview(value, 24);
    let digits = value
        .strip_prefix("F_")
        .or_else(|| value.strip_prefix('F'))
        .ok_or_else(|| {
            LanguageError::new(
                Stage::Parsing,
                format!("invalid drive `{preview}`; allowed range is 1..=7"),
                Some(position),
            )
        })?;
    if digits.is_empty()
        || digits.len() > MAX_SMALL_INDEX_DIGITS
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("invalid drive `{preview}`; allowed range is 1..=7"),
            Some(position),
        ));
    }
    let drive = digits.parse::<u8>().map_err(|_| {
        LanguageError::new(
            Stage::Parsing,
            format!("drive `{preview}` overflows u8; allowed range is 1..=7"),
            Some(position),
        )
    })?;
    if !(1..=7).contains(&drive) {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!("drive `{preview}` is out of range; allowed range is 1..=7"),
            Some(position),
        ));
    }
    Ok(drive)
}

fn parse_number_i64(digits: &str, position: usize) -> Result<i64, LanguageError> {
    let preview = truncate_token_preview(digits, 24);
    if digits.is_empty() || digits.len() > MAX_INT_DIGITS {
        return Err(LanguageError::new(
            Stage::Parsing,
            format!(
                "integer literal `{preview}` exceeds maximum digit length ({MAX_INT_DIGITS}); allowed range is {}..={}",
                i64::MIN,
                i64::MAX
            ),
            Some(position),
        ));
    }
    digits.parse::<i64>().map_err(|_| {
        LanguageError::new(
            Stage::Parsing,
            format!(
                "integer literal `{preview}` is out of range; allowed range is {}..={}",
                i64::MIN,
                i64::MAX
            ),
            Some(position),
        )
    })
}

pub fn lex(source: &str) -> Result<Vec<LexToken>, LanguageError> {
    let mut tokens = Vec::new();
    let mut index = 0usize;
    while let Some(rest) = source.get(index..) {
        let Some(ch) = rest.chars().next() else {
            break;
        };
        if ch == ' ' || ch == '\t' || ch == '\r' {
            index += ch.len_utf8();
            continue;
        }
        if ch == '\n' {
            tokens.push(LexToken {
                kind: TokenKind::Semi,
                value: "\n".to_string(),
                position: index,
            });
            index += 1;
            continue;
        }
        if ch == '#' || rest.starts_with("//") {
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                if next == '\n' {
                    break;
                }
                index += next.len_utf8();
            }
            continue;
        }
        if rest.starts_with("->") {
            tokens.push(LexToken {
                kind: TokenKind::Arrow,
                value: "->".to_string(),
                position: index,
            });
            index += 2;
            continue;
        }
        if ch == '\u{2209}' {
            tokens.push(LexToken {
                kind: TokenKind::NotMember,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch == '\u{2208}' {
            tokens.push(LexToken {
                kind: TokenKind::Member,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch == '\u{2286}' {
            tokens.push(LexToken {
                kind: TokenKind::SubsetEq,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch == '\u{2282}' {
            tokens.push(LexToken {
                kind: TokenKind::Subset,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch == '\u{2287}' {
            tokens.push(LexToken {
                kind: TokenKind::SupersetEq,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch == '\u{2283}' {
            tokens.push(LexToken {
                kind: TokenKind::Superset,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch == '\u{2205}' {
            tokens.push(LexToken {
                kind: TokenKind::EmptySet,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if rest.starts_with("CO-") {
            let start = index;
            index += 3;
            let digits_start = index;
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                if next.is_ascii_digit() {
                    index += 1;
                } else {
                    break;
                }
            }
            let digit_len = index - digits_start;
            if digit_len == 0 {
                return Err(LanguageError::new(
                    Stage::Lexing,
                    "operator token `CO-` requires an operator index in range 0..=9",
                    Some(start),
                ));
            }
            if digit_len > MAX_SMALL_INDEX_DIGITS {
                let preview = truncate_token_preview(&source[start..index], 24);
                return Err(LanguageError::new(
                    Stage::Lexing,
                    format!(
                        "operator token `{preview}` exceeds maximum digit length ({MAX_SMALL_INDEX_DIGITS}); allowed range is 0..=9"
                    ),
                    Some(start),
                ));
            }
            tokens.push(LexToken {
                kind: TokenKind::Co,
                value: source[start..index].to_string(),
                position: start,
            });
            continue;
        }
        if let Some(after_phi) = rest.strip_prefix("Phi") {
            if after_phi
                .chars()
                .next()
                .map(|next| !next.is_ascii_alphanumeric() && next != '_')
                .unwrap_or(true)
            {
                tokens.push(LexToken {
                    kind: TokenKind::Phi,
                    value: "Phi".to_string(),
                    position: index,
                });
                index += 3;
                continue;
            }
        }
        if matches!(ch, 'P' | 'C' | 'E' | 'O') {
            let start = index;
            index += 1;
            let digits_start = index;
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                if next.is_ascii_digit() {
                    index += 1;
                } else {
                    break;
                }
            }
            let digit_len = index - digits_start;
            if digit_len > MAX_SMALL_INDEX_DIGITS {
                let preview = truncate_token_preview(&source[start..index], 24);
                return Err(LanguageError::new(
                    Stage::Lexing,
                    format!(
                        "state reference `{preview}` exceeds maximum digit length ({MAX_SMALL_INDEX_DIGITS}); allowed operator range is 0..=9"
                    ),
                    Some(start),
                ));
            }
            if digit_len > 0 {
                tokens.push(LexToken {
                    kind: TokenKind::StateRef,
                    value: source[start..index].to_string(),
                    position: start,
                });
            } else {
                tokens.push(LexToken {
                    kind: TokenKind::Domain,
                    value: source[start..index].to_string(),
                    position: start,
                });
            }
            continue;
        }
        if ch == 'F'
            && rest
                .get(ch.len_utf8()..)
                .and_then(|s| s.chars().next())
                .map(|next| next.is_ascii_digit() || next == '_')
                .unwrap_or(false)
        {
            let start = index;
            index += 1;
            if source
                .get(index..)
                .map(|s| s.starts_with('_'))
                .unwrap_or(false)
            {
                index += 1;
            }
            let digits_start = index;
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                if next.is_ascii_digit() {
                    index += 1;
                } else {
                    break;
                }
            }
            let digit_len = index - digits_start;
            if digit_len == 0 {
                return Err(LanguageError::new(
                    Stage::Lexing,
                    format!(
                        "drive token `{}` requires a drive number in range 1..=7",
                        &source[start..index]
                    ),
                    Some(start),
                ));
            }
            if digit_len > MAX_SMALL_INDEX_DIGITS {
                let preview = truncate_token_preview(&source[start..index], 24);
                return Err(LanguageError::new(
                    Stage::Lexing,
                    format!(
                        "drive token `{preview}` exceeds maximum digit length ({MAX_SMALL_INDEX_DIGITS}); allowed range is 1..=7"
                    ),
                    Some(start),
                ));
            }
            tokens.push(LexToken {
                kind: TokenKind::Drive,
                value: source[start..index].to_string(),
                position: start,
            });
            continue;
        }
        if ch == '"' {
            let start = index;
            index += 1;
            let mut escaped = false;
            let mut terminated = false;
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                index += next.len_utf8();
                if escaped {
                    escaped = false;
                    continue;
                }
                if next == '\\' {
                    escaped = true;
                } else if next == '"' {
                    terminated = true;
                    break;
                }
            }
            if !terminated {
                return Err(LanguageError::new(
                    Stage::Lexing,
                    "unterminated string literal",
                    Some(start),
                ));
            }
            tokens.push(LexToken {
                kind: TokenKind::String,
                value: source[start..index].to_string(),
                position: start,
            });
            continue;
        }
        if ch == '_' {
            tokens.push(LexToken {
                kind: TokenKind::Underscore,
                value: "_".to_string(),
                position: index,
            });
            index += 1;
            continue;
        }
        if ch == '\u{03A6}' {
            tokens.push(LexToken {
                kind: TokenKind::Phi,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        if ch.is_ascii_alphabetic() {
            let start = index;
            index += 1;
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                if next.is_ascii_alphanumeric() || next == '_' {
                    index += 1;
                } else {
                    break;
                }
            }
            let value = &source[start..index];
            let kind = match value {
                "export" => TokenKind::Export,
                "let" => TokenKind::Let,
                "fn" => TokenKind::Fn,
                "use" => TokenKind::Use,
                "RPM" => TokenKind::Rpm,
                "Phi" => TokenKind::Phi,
                "circ" => TokenKind::Circ,
                _ => TokenKind::Ident,
            };
            tokens.push(LexToken {
                kind,
                value: value.to_string(),
                position: start,
            });
            continue;
        }
        if ch.is_ascii_digit() {
            let start = index;
            index += 1;
            while let Some(next) = source.get(index..).and_then(|s| s.chars().next()) {
                if next.is_ascii_digit() {
                    index += 1;
                } else {
                    break;
                }
            }
            let digit_len = index - start;
            if digit_len > MAX_INT_DIGITS {
                let preview = truncate_token_preview(&source[start..index], 24);
                return Err(LanguageError::new(
                    Stage::Lexing,
                    format!(
                        "integer literal `{preview}` exceeds maximum digit length ({MAX_INT_DIGITS}); allowed range is {}..={}",
                        i64::MIN,
                        i64::MAX
                    ),
                    Some(start),
                ));
            }
            tokens.push(LexToken {
                kind: TokenKind::Number,
                value: source[start..index].to_string(),
                position: start,
            });
            continue;
        }
        let kind = match ch {
            '*' | '\u{00d7}' => Some(TokenKind::Times),
            '/' | '\u{00f7}' => Some(TokenKind::Divide),
            '\u{2218}' => Some(TokenKind::Circ),
            '^' => Some(TokenKind::Caret),
            '{' => Some(TokenKind::LBrace),
            '}' => Some(TokenKind::RBrace),
            '(' => Some(TokenKind::LParen),
            ')' => Some(TokenKind::RParen),
            '[' => Some(TokenKind::LBracket),
            ']' => Some(TokenKind::RBracket),
            '<' | '\u{27e8}' => Some(TokenKind::LAngle),
            '>' | '\u{27e9}' => Some(TokenKind::RAngle),
            ':' => Some(TokenKind::Colon),
            ',' => Some(TokenKind::Comma),
            '=' => Some(TokenKind::Equals),
            '|' => Some(TokenKind::Pipe),
            ';' => Some(TokenKind::Semi),
            _ => None,
        };
        if let Some(kind) = kind {
            tokens.push(LexToken {
                kind,
                value: ch.to_string(),
                position: index,
            });
            index += ch.len_utf8();
            continue;
        }
        return Err(LanguageError::new(
            Stage::Lexing,
            format!("unexpected character {ch:?}"),
            Some(index),
        ));
    }
    tokens.push(LexToken {
        kind: TokenKind::Eof,
        value: String::new(),
        position: source.len(),
    });
    Ok(tokens)
}

struct Parser {
    tokens: Vec<LexToken>,
    index: usize,
    depth: usize,
    eof: LexToken,
}

impl Parser {
    fn new(tokens: Vec<LexToken>) -> Self {
        let eof_pos = tokens.last().map(|t| t.position).unwrap_or(0);
        Self {
            tokens,
            index: 0,
            depth: 0,
            eof: LexToken {
                kind: TokenKind::Eof,
                value: String::new(),
                position: eof_pos,
            },
        }
    }

    fn current(&self) -> &LexToken {
        self.tokens.get(self.index).unwrap_or(&self.eof)
    }

    fn advance(&mut self) -> LexToken {
        let token = self.current().clone();
        if self.index < self.tokens.len() {
            self.index += 1;
        }
        token
    }

    fn expect(&mut self, kind: TokenKind) -> Result<LexToken, LanguageError> {
        let token = self.current().clone();
        if token.kind != kind {
            return Err(LanguageError::new(
                Stage::Parsing,
                format!("expected {:?}, got {:?}", kind, token.kind),
                Some(token.position),
            ));
        }
        Ok(self.advance())
    }

    fn with_depth<T>(
        &mut self,
        position: usize,
        f: impl FnOnce(&mut Self) -> Result<T, LanguageError>,
    ) -> Result<T, LanguageError> {
        if self.depth >= MAX_PARSE_DEPTH {
            return Err(LanguageError::new(
                Stage::Parsing,
                format!("maximum nesting depth ({MAX_PARSE_DEPTH}) exceeded"),
                Some(position),
            ));
        }
        self.depth += 1;
        let result = f(self);
        self.depth -= 1;
        result
    }

    fn parse(mut self) -> Result<AstNode, LanguageError> {
        let mut statements = Vec::new();
        while self.current().kind == TokenKind::Semi {
            self.advance();
        }
        while self.current().kind != TokenKind::Eof {
            statements.push(self.parse_statement()?);
            while self.current().kind == TokenKind::Semi {
                self.advance();
            }
        }
        if statements.is_empty() {
            return Err(LanguageError::new(Stage::Parsing, "empty program", None));
        }
        if statements.len() == 1 {
            Ok(statements.remove(0))
        } else {
            Ok(AstNode::Program { statements })
        }
    }

    fn parse_statement(&mut self) -> Result<AstNode, LanguageError> {
        let pos = self.current().position;
        self.with_depth(pos, |parser| match parser.current().kind {
            TokenKind::Export => {
                let token = parser.advance();
                let inner = parser.parse_statement()?;
                match inner {
                    AstNode::LetStatement(_) | AstNode::FunctionDef(_) => {
                        Ok(AstNode::ExportStatement(ExportStatement {
                            statement: Box::new(inner),
                        }))
                    }
                    _ => Err(LanguageError::new(
                        Stage::Parsing,
                        "export may only be applied to let or fn statements",
                        Some(token.position),
                    )),
                }
            }
            TokenKind::Let => {
                parser.advance();
                let name = parser.expect(TokenKind::Ident)?.value;
                let annotation = if parser.current().kind == TokenKind::Colon {
                    parser.advance();
                    Some(parser.parse_type()?)
                } else {
                    None
                };
                parser.expect(TokenKind::Equals)?;
                Ok(AstNode::LetStatement(LetStatement {
                    name,
                    annotation,
                    expr: Box::new(parser.parse_expression()?),
                }))
            }
            TokenKind::Fn => {
                parser.advance();
                let name = parser.expect(TokenKind::Ident)?.value;
                parser.expect(TokenKind::LParen)?;
                let mut params = Vec::new();
                let mut param_types = Vec::new();
                if parser.current().kind != TokenKind::RParen {
                    loop {
                        params.push(parser.expect(TokenKind::Ident)?.value);
                        if parser.current().kind == TokenKind::Colon {
                            parser.advance();
                            param_types.push(parser.parse_type()?);
                        } else {
                            param_types.push(TypeInfo::any());
                        }
                        if parser.current().kind != TokenKind::Comma {
                            break;
                        }
                        parser.advance();
                    }
                }
                parser.expect(TokenKind::RParen)?;
                let return_type = if parser.current().kind == TokenKind::Colon {
                    parser.advance();
                    Some(parser.parse_type()?)
                } else {
                    None
                };
                parser.expect(TokenKind::Equals)?;
                Ok(AstNode::FunctionDef(FunctionDef {
                    name,
                    params,
                    param_types,
                    return_type,
                    body: Box::new(parser.parse_expression()?),
                }))
            }
            TokenKind::Use => {
                parser.advance();
                let string_token = parser.expect(TokenKind::String)?;
                let path = decode_path_literal(&string_token.value, string_token.position)?;
                Ok(AstNode::UseStatement(UseStatement { path }))
            }
            _ => parser.parse_expression(),
        })
    }

    fn parse_type(&mut self) -> Result<TypeInfo, LanguageError> {
        let ident_token = self.expect(TokenKind::Ident)?;
        let kind = type_keyword_to_kind(&ident_token.value, ident_token.position)?;
        let mut domains = Vec::new();
        if self.current().kind == TokenKind::LBracket {
            self.advance();
            domains.push(self.expect(TokenKind::Domain)?.value);
            while self.current().kind == TokenKind::Comma {
                self.advance();
                domains.push(self.expect(TokenKind::Domain)?.value);
            }
            self.expect(TokenKind::RBracket)?;
        }
        let singular = matches!(
            kind,
            TypeKind::State
                | TypeKind::Drive
                | TypeKind::String
                | TypeKind::Fractal
                | TypeKind::Rpm
                | TypeKind::Number
                | TypeKind::MetaSet
                | TypeKind::MetaSymbol
                | TypeKind::MetaAssertion
        );
        Ok(TypeInfo::new(kind, domains, singular))
    }

    fn parse_expression(&mut self) -> Result<AstNode, LanguageError> {
        let pos = self.current().position;
        self.with_depth(pos, |parser| {
            let mut expr = parser.parse_relation()?;
            loop {
                let op = match parser.current().kind {
                    TokenKind::Member => MetaOp::Member,
                    TokenKind::NotMember => MetaOp::NotMember,
                    TokenKind::Subset => MetaOp::Subset,
                    TokenKind::SubsetEq => MetaOp::SubsetEq,
                    TokenKind::Superset => MetaOp::Superset,
                    TokenKind::SupersetEq => MetaOp::SupersetEq,
                    _ => break,
                };
                parser.advance();
                let rhs = parser.parse_relation()?;
                expr = AstNode::MetaAssertion {
                    op,
                    left: Box::new(expr),
                    right: Box::new(rhs),
                };
            }
            if parser.current().kind == TokenKind::Equals
                && matches!(expr, AstNode::CardinalityExpr { .. })
            {
                parser.advance();
                let rhs = parser.parse_expression()?;
                expr = AstNode::MetaAssertion {
                    op: MetaOp::Equals,
                    left: Box::new(expr),
                    right: Box::new(rhs),
                };
            }
            Ok(expr)
        })
    }

    fn parse_relation(&mut self) -> Result<AstNode, LanguageError> {
        let mut expr = self.parse_composition()?;
        while self.current().kind == TokenKind::Arrow {
            self.advance();
            let rhs = self.parse_composition()?;
            expr = AstNode::BinaryExpr {
                op: BinaryOp::Arrow,
                left: Box::new(expr),
                right: Box::new(rhs),
            };
        }
        Ok(expr)
    }

    fn parse_composition(&mut self) -> Result<AstNode, LanguageError> {
        let mut expr = self.parse_primary()?;
        loop {
            let op = match self.current().kind {
                TokenKind::Times => BinaryOp::Times,
                TokenKind::Divide => BinaryOp::Divide,
                TokenKind::Circ => BinaryOp::Circ,
                _ => break,
            };
            self.advance();
            let rhs = self.parse_primary()?;
            expr = AstNode::BinaryExpr {
                op,
                left: Box::new(expr),
                right: Box::new(rhs),
            };
        }
        Ok(expr)
    }

    fn parse_primary(&mut self) -> Result<AstNode, LanguageError> {
        match self.current().kind {
            TokenKind::LParen => {
                self.advance();
                let expr = self.parse_expression()?;
                self.expect(TokenKind::RParen)?;
                Ok(expr)
            }
            TokenKind::Pipe => self.parse_cardinality(),
            TokenKind::Rpm => {
                self.advance();
                self.expect(TokenKind::LParen)?;
                let expr = self.parse_expression()?;
                self.expect(TokenKind::RParen)?;
                Ok(AstNode::RpmCall {
                    expr: Box::new(expr),
                })
            }
            TokenKind::Phi => self.parse_fractal(),
            TokenKind::Co => self.parse_state(),
            TokenKind::StateRef => {
                let token = self.advance();
                let (domain, operator) = parse_state_ref(&token.value, token.position)?;
                Ok(AstNode::StateLiteral {
                    operator,
                    domain,
                    drive: None,
                    domain_explicit: true,
                })
            }
            TokenKind::String => {
                let token = self.advance();
                Ok(AstNode::StringLiteral {
                    value: decode_string_literal(&token.value, token.position)?,
                })
            }
            TokenKind::Number => {
                let token = self.advance();
                Ok(AstNode::NumberLiteral {
                    value: parse_number_i64(&token.value, token.position)?,
                })
            }
            TokenKind::EmptySet => {
                self.advance();
                Ok(AstNode::EmptySetLiteral)
            }
            TokenKind::Domain => Ok(AstNode::MetaSymbol {
                name: self.advance().value,
                symbol_kind: "domain".to_string(),
            }),
            TokenKind::Ident => {
                let name = self.advance().value;
                if self.current().kind == TokenKind::LParen {
                    self.advance();
                    let mut args = Vec::new();
                    if self.current().kind != TokenKind::RParen {
                        loop {
                            args.push(self.parse_expression()?);
                            if self.current().kind != TokenKind::Comma {
                                break;
                            }
                            self.advance();
                        }
                    }
                    self.expect(TokenKind::RParen)?;
                    Ok(AstNode::CallExpr { callee: name, args })
                } else if let Some(canonical) = canonical_meta_set_name(&name) {
                    Ok(AstNode::MetaSetLiteral {
                        name: canonical.to_string(),
                    })
                } else if matches!(name.as_str(), "T" | "A" | "f" | "E") {
                    Ok(AstNode::MetaSymbol {
                        name,
                        symbol_kind: "register".to_string(),
                    })
                } else {
                    Ok(AstNode::Identifier { name })
                }
            }
            TokenKind::Drive => self.parse_drive_or_drive_register_symbol(),
            _ => Err(LanguageError::new(
                Stage::Parsing,
                format!("unexpected token {:?}", self.current().kind),
                Some(self.current().position),
            )),
        }
    }

    fn parse_state(&mut self) -> Result<AstNode, LanguageError> {
        let token = self.expect(TokenKind::Co)?;
        let operator = parse_co_operator(&token.value, token.position)?;
        let mut domain = "P".to_string();
        let mut domain_explicit = false;
        let mut drive = None;
        if self.current().kind == TokenKind::Caret {
            self.advance();
            domain = self.expect(TokenKind::Domain)?.value;
            domain_explicit = true;
        }
        if self.current().kind == TokenKind::Underscore {
            self.advance();
            self.expect(TokenKind::LBrace)?;
            let drive_token = self.expect(TokenKind::Drive)?;
            drive = Some(parse_drive_token_value(
                &drive_token.value,
                drive_token.position,
            )?);
            self.expect(TokenKind::RBrace)?;
        }
        Ok(AstNode::StateLiteral {
            operator,
            domain,
            drive,
            domain_explicit,
        })
    }

    fn parse_drive_or_drive_register_symbol(&mut self) -> Result<AstNode, LanguageError> {
        let token = self.expect(TokenKind::Drive)?;
        let drive = parse_drive_token_value(&token.value, token.position)?;
        if self.current().kind == TokenKind::Pipe {
            self.advance();
            let reg = self.expect(TokenKind::Ident)?.value;
            if !matches!(reg.as_str(), "T" | "A" | "f" | "E") {
                return Err(LanguageError::new(
                    Stage::Parsing,
                    format!("invalid register {reg}"),
                    Some(token.position),
                ));
            }
            return Ok(AstNode::MetaSymbol {
                name: format!("F{drive}|{reg}"),
                symbol_kind: "drive_register".to_string(),
            });
        }
        Ok(AstNode::DriveLiteral { drive })
    }

    fn parse_cardinality(&mut self) -> Result<AstNode, LanguageError> {
        let pos = self.current().position;
        self.with_depth(pos, |parser| {
            parser.expect(TokenKind::Pipe)?;
            let collection = parser.parse_relation()?;
            parser.expect(TokenKind::Pipe)?;
            Ok(AstNode::CardinalityExpr {
                collection: Box::new(collection),
            })
        })
    }

    fn parse_fractal(&mut self) -> Result<AstNode, LanguageError> {
        self.expect(TokenKind::Phi)?;
        self.expect(TokenKind::LAngle)?;
        let first = self.expect(TokenKind::Number)?;
        let mut sequence = vec![parse_fractal_element(&first.value, first.position)?];
        while self.current().kind == TokenKind::Colon {
            self.advance();
            let next = self.expect(TokenKind::Number)?;
            sequence.push(parse_fractal_element(&next.value, next.position)?);
        }
        self.expect(TokenKind::RAngle)?;
        Ok(AstNode::FractalLiteral { sequence })
    }
}

pub fn parse_tokens(tokens: Vec<LexToken>) -> Result<AstNode, LanguageError> {
    Parser::new(tokens).parse()
}

pub fn parse_source(source: &str) -> Result<AstNode, LanguageError> {
    let tokens = lex(source)?;
    parse_tokens(tokens)
}

pub fn parse_file(path: impl AsRef<Path>) -> Result<AstNode, String> {
    let path = path.as_ref();
    let source = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    parse_source(&source).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_showcase_style_expression() {
        let ast = parse_source("compose(CO-2^C_{F2}, CO-4^C_{F2})").unwrap();
        match ast {
            AstNode::CallExpr { callee, .. } => assert_eq!(callee, "compose"),
            _ => panic!("expected call expression"),
        }
    }

    #[test]
    fn lexes_unicode_fractal_literal() {
        let tokens = lex("let motif = Φ⟨2:4:8⟩").unwrap();
        assert!(tokens.iter().any(|token| token.kind == TokenKind::Phi));
    }

    #[test]
    fn rejects_oversized_and_out_of_range_numeric_tokens_without_panic() {
        let cases = [
            ("CO-256", "0..=9"),
            ("CO-999999999999999999999999", "0..=9"),
            ("CO-", "0..=9"),
            ("CO-10", "0..=9"),
            ("P256", "0..=9"),
            ("C999999999999", "0..=9"),
            ("E10", "0..=9"),
            ("F999", "1..=7"),
            ("F256", "1..=7"),
            ("F0", "1..=7"),
            ("F8", "1..=7"),
            ("F_", "1..=7"),
            ("F_99999999999", "1..=7"),
            ("CO-2^C_{F999}", "1..=7"),
            ("999999999999999999999999999999", "allowed range"),
            ("9223372036854775808", "allowed range"),
            ("Φ<256:999>", "0..=9"),
            ("Phi<1:256>", "0..=9"),
            ("Phi<10>", "0..=9"),
            ("Phi<999999999999999999999999>", "allowed range"),
        ];
        for (input, expected_hint) in cases {
            let err = parse_source(input)
                .expect_err(&format!("expected error for adversarial input `{input}`"));
            let rendered = err.to_string();
            assert!(
                rendered.contains('@'),
                "error for `{input}` should include token position: {rendered}"
            );
            assert!(
                rendered.contains(expected_hint),
                "error for `{input}` should include `{expected_hint}`: {rendered}"
            );
        }
    }

    #[test]
    fn rejects_negative_oversized_integer_and_unterminated_quotes_without_panic() {
        for input in [
            "-999999999999999999999999999999",
            "\"",
            "\"\\",
            "\"\\\"",
            "use \"",
            "use \"\\\"",
        ] {
            assert!(
                parse_source(input).is_err(),
                "expected clean error for `{input}`"
            );
        }
    }

    #[test]
    fn rejects_deeply_nested_inputs_without_stack_overflow() {
        let deep_parens = format!("{}CO-2{}", "(".repeat(2_000), ")".repeat(2_000));
        let err = parse_source(&deep_parens).expect_err("deep parens must fail cleanly");
        assert!(
            err.to_string().contains("maximum nesting depth"),
            "unexpected error: {err}"
        );

        let deep_exports = format!("{}let x = CO-2", "export ".repeat(500));
        let err = parse_source(&deep_exports).expect_err("deep exports must fail cleanly");
        assert!(
            err.to_string().contains("maximum nesting depth"),
            "unexpected error: {err}"
        );

        let deep_pipes = format!("{}States{}", "|".repeat(500), "|".repeat(500));
        let err = parse_source(&deep_pipes).expect_err("deep pipes must fail cleanly");
        assert!(
            err.to_string().contains("maximum nesting depth"),
            "unexpected error: {err}"
        );

        let deep_calls = format!("{}CO-2{}", "f(".repeat(500), ")".repeat(500));
        let err = parse_source(&deep_calls).expect_err("deep calls must fail cleanly");
        assert!(
            err.to_string().contains("maximum nesting depth"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn handles_malformed_synthetic_token_streams_without_panic() {
        assert!(parse_tokens(Vec::new()).is_err());

        let malformed_streams = [
            vec![LexToken {
                kind: TokenKind::StateRef,
                value: String::new(),
                position: 0,
            }],
            vec![LexToken {
                kind: TokenKind::StateRef,
                value: "Φ2".to_string(),
                position: 0,
            }],
            vec![LexToken {
                kind: TokenKind::StateRef,
                value: "P999".to_string(),
                position: 3,
            }],
            vec![LexToken {
                kind: TokenKind::Co,
                value: "X".to_string(),
                position: 0,
            }],
            vec![LexToken {
                kind: TokenKind::Co,
                value: "CO-999".to_string(),
                position: 2,
            }],
            vec![LexToken {
                kind: TokenKind::String,
                value: "\"".to_string(),
                position: 0,
            }],
            vec![LexToken {
                kind: TokenKind::String,
                value: "🦀".to_string(),
                position: 0,
            }],
            vec![LexToken {
                kind: TokenKind::Number,
                value: "99999999999999999999999999999".to_string(),
                position: 1,
            }],
            vec![LexToken {
                kind: TokenKind::Let,
                value: "let".to_string(),
                position: 0,
            }],
        ];

        for tokens in malformed_streams {
            assert!(parse_tokens(tokens).is_err());
        }
    }

    #[test]
    fn deterministic_adversarial_corpus_never_panics() {
        // Deterministic xorshift64* PRNG for reproducible fuzz-style coverage.
        let mut state: u64 = 0x5EED_CAFE_BEEF_1337;
        let mut next_u64 = || {
            state ^= state >> 12;
            state ^= state << 25;
            state ^= state >> 27;
            state.wrapping_mul(0x2545_F491_4F6C_DD1D)
        };

        let fragments = [
            "CO-",
            "CO-256",
            "CO-999999999999999999999",
            "P",
            "C",
            "E",
            "O",
            "P256",
            "C99999",
            "F",
            "F_",
            "F0",
            "F8",
            "F999",
            "F_99999999999",
            "Phi",
            "Φ",
            "⟨",
            "⟩",
            "<",
            ">",
            ":",
            "(",
            ")",
            "[",
            "]",
            "{",
            "}",
            "|",
            "->",
            "*",
            "/",
            "circ",
            "=",
            ";",
            ",",
            "^",
            "_",
            "\"",
            "\\\"",
            "let ",
            "fn ",
            "export ",
            "use ",
            "RPM",
            "∅",
            "∈",
            "∉",
            "⊂",
            "⊆",
            "⊃",
            "⊇",
            "999999999999999999999999999999",
            "-999999999999999999999999999999",
            "9223372036854775807",
            "9223372036854775808",
            "0",
            "9",
            "255",
            "256",
            " ",
            "\n",
            "\t",
            "#comment\n",
            "//comment\n",
            "🦀",
            "\u{0000}",
            "\u{FEFF}",
        ];

        for _ in 0..600 {
            let count = (next_u64() % 18) as usize + 1;
            let mut sample = String::new();
            for _ in 0..count {
                let idx = (next_u64() as usize) % fragments.len();
                sample.push_str(fragments[idx]);
            }
            let _ = lex(&sample);
            let _ = parse_source(&sample);
        }

        // Arbitrary UTF-8 strings built from random Unicode scalar values.
        for _ in 0..300 {
            let len = (next_u64() % 48) as usize;
            let mut sample = String::with_capacity(len);
            for _ in 0..len {
                let raw = (next_u64() % 0x110000) as u32;
                if let Some(ch) = char::from_u32(raw) {
                    sample.push(ch);
                }
            }
            let _ = lex(&sample);
            let _ = parse_source(&sample);
        }
    }
}
