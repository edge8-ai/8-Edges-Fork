#!/usr/bin/env perl
# Usage: perl scripts/design/inline-to-classes.pl < file.tsx > out.tsx
# Run this exact-pattern pass first, then smart-inline.pl, then `npx tsc`.
# Mechanical inline-style → class conversion for the admin design system.
# Exact-pattern substitutions only; anything unmatched is left for hand review.
use strict; use warnings;
my %mt = (2=>"u-mt-1",4=>"u-mt-1",6=>"u-mt-2",8=>"u-mt-2",10=>"u-mt-3",12=>"u-mt-3",14=>"u-mt-4",16=>"u-mt-4",18=>"u-mt-4",20=>"u-mt-5",24=>"u-mt-5",28=>"u-mt-6",32=>"u-mt-6");
my %mb = (0=>"u-mb-0",2=>"u-mb-1",4=>"u-mb-1",6=>"u-mb-2",8=>"u-mb-2",10=>"u-mb-3",12=>"u-mb-3",14=>"u-mb-4",16=>"u-mb-4",18=>"u-mb-4",20=>"u-mb-5",24=>"u-mb-5",28=>"u-mb-6",32=>"u-mb-6");
my %gap = (2=>"u-gap-1",4=>"u-gap-1",6=>"u-gap-2",8=>"u-gap-2",10=>"u-gap-3",12=>"u-gap-3",14=>"u-gap-4",16=>"u-gap-4",20=>"u-gap-5",24=>"u-gap-5");
sub thw { my $w=shift; return $w<=60?"admin-th--xs":$w<=130?"admin-th--sm":$w<=180?"admin-th--md":"admin-th--lg"; }
sub merge { my ($cls, $add) = @_; return $cls ? "$cls $add" : $add; }

while (my $line = <STDIN>) {
  # table wrap / th / td
  $line =~ s/className="admin-table-wrap" style=\{\{ boxShadow: "none" \}\}/className="admin-table-wrap admin-table-wrap--flat"/g;
  $line =~ s/<th style=\{\{ width: (\d+), textAlign: "right" \}\}>/"<th className=\"".thw($1)." u-right\">"/ge;
  $line =~ s/<th style=\{\{ width: (\d+) \}\}>/"<th className=\"".thw($1)."\">"/ge;
  $line =~ s/<th style=\{\{ textAlign: "right" \}\}>/<th className="u-right">/g;
  $line =~ s/<td style=\{\{ textAlign: "right", whiteSpace: "nowrap" \}\}>/<td className="u-right u-nowrap">/g;
  $line =~ s/<td style=\{\{ textAlign: "right" \}\}>/<td className="u-right">/g;
  $line =~ s/<td style=\{\{ whiteSpace: "nowrap" \}\}>/<td className="u-nowrap">/g;
  $line =~ s/<td style=\{\{ fontWeight: 600 \}\}>/<td className="u-strong">/g;
  $line =~ s/<(div|span) style=\{\{ fontWeight: 600 \}\}>/<$1 className="u-strong">/g;
  # muted text sizes
  $line =~ s/className="admin-cell-muted" style=\{\{ fontSize: 1[23], marginTop: [24] \}\}/className="admin-cell-muted u-sm u-mt-1"/g;
  $line =~ s/className="admin-cell-muted" style=\{\{ fontSize: 1[23], whiteSpace: "nowrap" \}\}/className="admin-cell-muted u-sm u-nowrap"/g;
  $line =~ s/className="admin-cell-muted" style=\{\{ fontSize: 1[23] \}\}/className="admin-cell-muted u-sm"/g;
  $line =~ s/className="admin-cell-muted" style=\{\{ fontSize: 11 \}\}/className="admin-cell-muted u-xs"/g;
  $line =~ s/className="admin-cell-muted" style=\{\{ fontVariantNumeric: "tabular-nums" \}\}/className="admin-cell-muted u-tabular"/g;
  $line =~ s/className="admin-cell-muted" style=\{\{ fontWeight: 400 \}\}/className="admin-cell-muted"/g;
  $line =~ s/<(span|div|p) style=\{\{ fontSize: 1[23] \}\}>/<$1 className="u-sm">/g;
  $line =~ s/<(span|div|p) style=\{\{ fontSize: 11 \}\}>/<$1 className="u-xs">/g;
  $line =~ s/<(span|div|p) style=\{\{ fontSize: 1[23], color: "var\(--admin-muted\)" \}\}>/<$1 className="u-sm u-muted">/g;
  $line =~ s/<(span|div|p) style=\{\{ color: "var\(--admin-muted\)", fontSize: 1[23] \}\}>/<$1 className="u-sm u-muted">/g;
  $line =~ s/<(span|div|p) style=\{\{ color: "var\(--admin-muted\)" \}\}>/<$1 className="u-muted">/g;
  $line =~ s/<(span|div|p) style=\{\{ color: "var\(--admin-ink-2\)" \}\}>/<$1 className="u-ink-2">/g;
  $line =~ s/<(span|div|p|strong) style=\{\{ color: "var\(--admin-err-ink\)" \}\}>/<$1 className="u-err">/g;
  $line =~ s/<(span|div|p|strong) style=\{\{ color: "var\(--admin-warn-ink\)" \}\}>/<$1 className="u-warn">/g;
  $line =~ s/<(span|div|p) style=\{\{ color: "var\(--admin-ok-ink\)", fontWeight: 600 \}\}>/<$1 className="u-ok">/g;
  $line =~ s/<(span|div|p) style=\{\{ whiteSpace: "nowrap" \}\}>/<$1 className="u-nowrap">/g;
  $line =~ s/<(div|p) style=\{\{ whiteSpace: "pre-wrap" \}\}>/<$1 className="u-prewrap">/g;
  $line =~ s/<ul style=\{\{ margin: 0, paddingLeft: 1[68] \}\}>/<ul className="u-list">/g;
  # flex rows / stacks
  $line =~ s/<(span|div) style=\{\{ display: "(?:inline-)?flex", alignItems: "center", gap: (\d+)(?:, flexWrap: "wrap")? \}\}>/"<$1 className=\"u-row".($line =~ m|flexWrap: "wrap"| ? " u-wrap" : "")."\">"/ge;
  $line =~ s/<(span|div) style=\{\{ display: "(?:inline-)?flex", gap: (\d+), alignItems: "center"(?:, flexWrap: "wrap")? \}\}>/"<$1 className=\"u-row".($line =~ m|flexWrap: "wrap"| ? " u-wrap" : "")."\">"/ge;
  $line =~ s/<(span|div) style=\{\{ display: "(?:inline-)?flex", gap: (\d+)(?:, flexWrap: "wrap")? \}\}>/"<$1 className=\"u-row".($line =~ m|flexWrap: "wrap"| ? " u-wrap" : "")."\">"/ge;
  $line =~ s/<(span|div) style=\{\{ display: "flex", flexWrap: "wrap", gap: (\d+) \}\}>/<$1 className="u-row u-wrap">/g;
  $line =~ s/<div style=\{\{ display: "flex", flexDirection: "column", gap: (\d+) \}\}>/"<div className=\"u-stack".($1>8 ? " ".$gap{$1} : "")."\">"/ge;
  $line =~ s/<div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "center"(?:, gap: \d+)?(?:, flexWrap: "wrap")?, marginBottom: \d+ \}\}>/<div className="admin-card-head">/g;
  $line =~ s/<div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "(?:center|baseline)"(?:, gap: \d+)?(?:, flexWrap: "wrap")? \}\}>/<div className="u-row u-wrap u-between">/g;
  $line =~ s/<div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "flex-start"(?:, gap: \d+)?(?:, flexWrap: "wrap")? \}\}>/<div className="u-row-top u-wrap u-between">/g;
  $line =~ s/<div style=\{\{ display: "flex", justifyContent: "flex-end", gap: (\d+)(?:, marginTop: (\d+))? \}\}>/"<div className=\"u-row u-end".(defined $2 && $mt{$2} ? " $mt{$2}" : "")."\">"/ge;
  $line =~ s/<div style=\{\{ display: "flex", gap: (\d+), justifyContent: "flex-end"(?:, marginTop: (\d+))? \}\}>/"<div className=\"u-row u-end".(defined $2 && $mt{$2} ? " $mt{$2}" : "")."\">"/ge;
  $line =~ s/<div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "center" \}\}>/<div className="u-row u-between">/g;
  $line =~ s/<div style=\{\{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: (\d+) \}\}>/"<div className=\"u-grid-2".($gap{$1} ? " $gap{$1}" : "")."\">"/ge;
  $line =~ s/<div style=\{\{ display: "grid", gridTemplateColumns: "repeat\(2, (?:1fr|minmax\(0, 1fr\))\)", gap: (\d+) \}\}>/"<div className=\"u-grid-2".($gap{$1} ? " $gap{$1}" : "")."\">"/ge;
  $line =~ s/<div style=\{\{ display: "grid", gridTemplateColumns: "repeat\(3, (?:1fr|minmax\(0, 1fr\))\)", gap: (\d+) \}\}>/"<div className=\"u-grid-3".($gap{$1} ? " $gap{$1}" : "")."\">"/ge;
  $line =~ s/<div style=\{\{ display: "grid", gridTemplateColumns: [^}]*?, gap: 10, alignItems: "end"(?:, marginTop: 10)? \}\}>/<div className="admin-form-row">/g;
  $line =~ s/className="admin-card-title" style=\{\{ margin: 0 \}\}/className="admin-card-title"/g;
  $line =~ s/className="admin-progress" style=\{\{ flex: 1 \}\}/className="admin-progress u-grow"/g;
  $line =~ s/<div style=\{\{ flex: 1 \}\}>/<div className="u-grow">/g;
  $line =~ s/<div style=\{\{ marginLeft: "auto" \}\}>/<div className="u-ml-auto">/g;
  $line =~ s/<(span|div) style=\{\{ marginLeft: "auto" \}\}>/<$1 className="u-ml-auto">/g;
  $line =~ s/className="admin-input" style=\{\{ width: 70 \}\}/className="admin-input admin-input--w-xs"/g;
  $line =~ s/className="(admin-input|admin-select)" style=\{\{ maxWidth: 2[02]0 \}\}/className="$1 admin-input--w-sm"/g;
  $line =~ s/style=\{\{ textDecoration: "none", color: "inherit" \}\}/className="u-link-plain"/g;
  $line =~ s/style=\{\{ color: "inherit", textDecoration: "none" \}\}/className="u-link-plain"/g;
  $line =~ s/className="admin-page-sub" style=\{\{ margin: 0 \}\}/className="admin-page-sub u-m-0"/g;
  $line =~ s/<p style=\{\{ margin: 0 \}\}>/<p className="u-m-0">/g;
  $line =~ s/className="admin-alert admin-alert--(\w+)" style=\{\{ marginBottom: (\d+) \}\}/exists $mb{$2} ? "className=\"admin-alert admin-alert--$1 $mb{$2}\"" : "className=\"admin-alert admin-alert--$1\" style={{ marginBottom: $2 }}"/ge;
  # margin-only styles, with or without an existing className
  $line =~ s/className="([^"]*)" style=\{\{ marginBottom: (\d+) \}\}/exists $mb{$2} ? "className=\"$1 $mb{$2}\"" : "className=\"$1\" style={{ marginBottom: $2 }}"/ge;
  $line =~ s/className="([^"]*)" style=\{\{ marginTop: (\d+) \}\}/exists $mt{$2} ? "className=\"$1 $mt{$2}\"" : "className=\"$1\" style={{ marginTop: $2 }}"/ge;
  $line =~ s/className="([^"]*)" style=\{\{ marginTop: (\d+), marginBottom: (\d+) \}\}/(exists $mt{$2} && exists $mb{$3}) ? "className=\"$1 $mt{$2} $mb{$3}\"" : "className=\"$1\" style={{ marginTop: $2, marginBottom: $3 }}"/ge;
  $line =~ s/<(div|p|span|section) style=\{\{ marginBottom: (\d+) \}\}>/exists $mb{$2} ? "<$1 className=\"$mb{$2}\">" : "<$1 style={{ marginBottom: $2 }}>"/ge;
  $line =~ s/<(div|p|span|section) style=\{\{ marginTop: (\d+) \}\}>/exists $mt{$2} ? "<$1 className=\"$mt{$2}\">" : "<$1 style={{ marginTop: $2 }}>"/ge;
  $line =~ s/<(div|p) style=\{\{ marginTop: (\d+), marginBottom: (\d+) \}\}>/(exists $mt{$2} && exists $mb{$3}) ? "<$1 className=\"$mt{$2} $mb{$3}\">" : "<$1 style={{ marginTop: $2, marginBottom: $3 }}>"/ge;
  # two-attribute merge: className="x" style={{ display flex ... }} common cases
  $line =~ s/className="([^"]*)" style=\{\{ display: "flex", alignItems: "center", gap: \d+(?:, flexWrap: "wrap")? \}\}/"className=\"$1 u-row".($line =~ m|flexWrap: "wrap"| ? " u-wrap" : "")."\""/ge;
  $line =~ s/className="([^"]*)" style=\{\{ display: "flex", gap: \d+, alignItems: "center"(?:, flexWrap: "wrap")? \}\}/"className=\"$1 u-row".($line =~ m|flexWrap: "wrap"| ? " u-wrap" : "")."\""/ge;
  $line =~ s/className="([^"]*)" style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "center"(?:, gap: \d+)?(?:, flexWrap: "wrap")? \}\}/className="$1 u-row u-wrap u-between"/g;
  $line =~ s/className="([^"]*)" style=\{\{ display: "flex", flexDirection: "column", gap: (\d+) \}\}/"className=\"$1 u-stack".($2>8 && $gap{$2} ? " $gap{$2}" : "")."\""/ge;
  $line =~ s/className="([^"]*)" style=\{\{ fontSize: 1[23] \}\}/className="$1 u-sm"/g;
  $line =~ s/className="([^"]*)" style=\{\{ whiteSpace: "nowrap" \}\}/className="$1 u-nowrap"/g;
  $line =~ s/className="([^"]*)" style=\{\{ flex: 1 \}\}/className="$1 u-grow"/g;
  $line =~ s/className="([^"]*)" style=\{\{ width: "100%" \}\}/className="$1 u-w-full"/g;
  $line =~ s/className="([^"]*)" style=\{\{ textAlign: "right" \}\}/className="$1 u-right"/g;
  $line =~ s/className="([^"]*)" style=\{\{ alignItems: "flex-end" \}\}/className="$1 u-items-end"/g;
  $line =~ s/className="([^"]*)" style=\{\{ alignItems: "flex-start" \}\}/className="$1 u-items-start"/g;
  print $line;
}
