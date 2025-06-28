# Definition File Grammar

The definition files are designed to be valid markdown files, hence the grammar is a simple subset of a markdown file. 
This documentation here is written partly for fun and academic practice, and also for those who are interested in how the parser is written, should you want to understand it better, whether to contribute or otherwise. I welcome comments on any mistakes I make and how the grammar could be improved.

The consolidated file parser is written as a LL parser, with some backtracking in order to support optional syntax. The following is written in extended Backus-Naur form:

```text
DOC = { DEFBLOCK };
DEFBLOCK = HEADER, [ ALIASES ], DEF, (DELIMITER | EOF);
HEADER = { NEWLINE } , HASH, SPACE, { CHAR }, NEWLINE;
ALIASES = { NEWLINE }, ASTERISK, { [{ CHAR, COMMA }], CHAR }, ASTERISK, NEWLINE;
DEF = { CHAR };
CHAR = any char;
DELIMITER = NEWLINE, DASH, DASH, DASH, NEWLINE;

HASH = "#"
ASTERISK = "*"
NEWLINE = "\n"
DASH = "-"
```
