#!/usr/bin/env perl
# Usage: perl scripts/design/smart-inline.pl < file.tsx > out.tsx
# Run after inline-to-classes.pl. Always `npx tsc` afterwards: the one
# failure mode is two className attributes on one element (TS17001).
# Smart inline-style → utility-class converter. For each single-line
# `style={{ ... }}` whose every property maps to a utility, replace the whole
# block with classes merged into the element's className. Blocks with any
# unmapped property are left untouched (for hand review). Reads a file on
# STDIN, writes to STDOUT.
use strict; use warnings;
local $/; my $src = <STDIN>;

# Public-site files use single quotes; normalise them inside style bodies only.
$src =~ s{style=\{\{([^{}]*)\}\}}{ my $b = $1; $b =~ s/'/"/g unless $b =~ /"/; "style={{$b}}" }ge;

# 1. Normalise multi-line style blocks (no nested braces / functions) onto one line.
$src =~ s{style=\{\{\s*\n((?:\s*[^{}\n]*,?\n)+?)\s*\}\}}{"style={{ " . join(", ", map { my $x = $_; $x =~ s{^\s+}{}; $x =~ s{,\s*$}{}; $x } grep { m{\S} } split(m{\n}, $1)) . " }}"}ge;

my %mt = (0=>"u-mt-0",2=>"u-mt-1",4=>"u-mt-1",5=>"u-mt-1",6=>"u-mt-2",8=>"u-mt-2",10=>"u-mt-3",12=>"u-mt-3",14=>"u-mt-4",16=>"u-mt-4",18=>"u-mt-4",20=>"u-mt-5",24=>"u-mt-5",28=>"u-mt-6",32=>"u-mt-6",40=>"u-mt-7",48=>"u-mt-8");
my %mb = (0=>"u-mb-0",2=>"u-mb-1",4=>"u-mb-1",5=>"u-mb-1",6=>"u-mb-2",8=>"u-mb-2",10=>"u-mb-3",12=>"u-mb-3",14=>"u-mb-4",16=>"u-mb-4",18=>"u-mb-4",20=>"u-mb-5",24=>"u-mb-5",28=>"u-mb-6",32=>"u-mb-6",40=>"u-mb-7",48=>"u-mb-8");
my %gap = (2=>"u-gap-1",3=>"u-gap-1",4=>"u-gap-1",5=>"u-gap-1",6=>"u-gap-2",8=>"u-gap-2",10=>"u-gap-3",12=>"u-gap-3",14=>"u-gap-4",16=>"u-gap-4",18=>"u-gap-4",20=>"u-gap-5",24=>"u-gap-5",32=>"u-gap-6");

sub map_props {
  my ($body) = @_;
  my %p;
  for my $pair (split /,\s*(?=[a-zA-Z]+\s*:)/, $body) {
    next unless $pair =~ /^\s*([a-zA-Z]+)\s*:\s*(.+?)\s*$/s;
    $p{$1} = $2;
  }
  return undef unless %p;
  my @cls; my $flex = 0;
  my $disp = delete $p{display};
  my $dir = delete $p{flexDirection};
  if (defined $disp) {
    return undef if $disp !~ /^"(flex|inline-flex|grid|block|inline-block|contents|none)"$/;
    my $d = $1;
    if ($d eq "flex" || $d eq "inline-flex" || $d eq "grid") {
      if (defined $dir && $dir eq '"column"') { push @cls, "u-stack"; }
      elsif ($d eq "grid") { push @cls, "u-stack"; }
      else { $flex = 1; }
    } elsif ($d eq "contents") { push @cls, "u-contents"; }
    elsif ($d eq "none") { return undef; }
    elsif ($d eq "block") { push @cls, "u-block"; }
    elsif ($d eq "inline-block") { push @cls, "u-inline-block"; }
  } elsif (defined $dir) { return undef; }
  my $align = delete $p{alignItems};
  my $just = delete $p{justifyContent};
  my $gapv = delete $p{gap};
  if ($flex) {
    if (!defined $align || $align eq '"center"') { push @cls, "u-row"; }
    elsif ($align eq '"flex-start"') { push @cls, "u-row-top"; }
    elsif ($align eq '"flex-end"') { push @cls, "u-row", "u-items-end"; }
    elsif ($align eq '"baseline"') { push @cls, "u-row"; }
    elsif ($align eq '"stretch"') { push @cls, "u-row", "u-items-start"; }
    else { return undef; }
    if (defined $gapv) { return undef unless $gap{$gapv}; push @cls, $gap{$gapv} if $gap{$gapv} ne "u-gap-2"; }
  } else {
    if (defined $align) {
      if ($align eq '"center"') { push @cls, "u-items-center"; }
      elsif ($align eq '"flex-start"') { push @cls, "u-items-start"; }
      elsif ($align eq '"flex-end"') { push @cls, "u-items-end"; }
      else { return undef; }
    }
    if (defined $gapv) { return undef unless $gap{$gapv}; push @cls, $gap{$gapv} if $gap{$gapv} ne "u-gap-2" || !grep { $_ eq "u-stack" } @cls; }
  }
  if (defined $just) {
    if ($just eq '"space-between"') { push @cls, "u-between"; }
    elsif ($just eq '"flex-end"') { push @cls, "u-end"; }
    elsif ($just eq '"center"') { push @cls, "u-center"; }
    elsif ($just eq '"flex-start"') { }
    else { return undef; }
  }
  if (defined(my $v = delete $p{flexWrap})) { return undef unless $v eq '"wrap"'; push @cls, "u-wrap"; }
  if (defined(my $v = delete $p{marginTop})) { return undef unless $v =~ /^\d+$/ && $mt{$v}; push @cls, $mt{$v}; }
  if (defined(my $v = delete $p{marginBottom})) { return undef unless $v =~ /^\d+$/ && $mb{$v}; push @cls, $mb{$v}; }
  if (defined(my $v = delete $p{marginLeft})) { if ($v eq '"auto"') { push @cls, "u-ml-auto" } elsif ($v =~ /^(6|8)$/) { push @cls, "u-ml-2" } else { return undef } }
  if (defined(my $v = delete $p{margin})) { if ($v eq '"0 auto"' || $v eq '"40px auto 0"') { push @cls, "u-mx-auto", ($v =~ /40px/ ? "u-mt-7" : ()) } elsif ($v eq '0') { push @cls, "u-m-0" } elsif ($v eq '16') { push @cls, "u-m-4" } elsif ($v =~ /^"0 0 (\d+)(?:px)?"$/ && $mb{$1}) { push @cls, "u-m-0", $mb{$1} } elsif ($v =~ /^"(\d+)px 0 0"$/ && $mt{$1}) { push @cls, "u-m-0", $mt{$1} } else { return undef } }
  if (defined(my $v = delete $p{padding})) { if ($v =~ /^(14|16|"14px 16px"|"16px 18px"|"16px 20px"|"18px 20px"|"12px 20px")$/) { push @cls, "u-p-4" } elsif ($v eq '"24px 28px"') { push @cls, "u-p-5" } elsif ($v =~ /^"(2|4)px 0"$/) { push @cls, "u-py-1" } elsif ($v =~ /^"4px 0 10px"$/) { push @cls, "u-pt-1", "u-pb-3" } elsif ($v =~ /^"(4px 8px|4px 10px|4px 10px 2px)"$/) { push @cls, "u-p-1" } elsif ($v =~ /^"(10|12)px 4px"$/) { push @cls, "u-py-3" } elsif ($v eq '"12px 14px"' || $v eq '12' || $v eq '"10px 12px"') { push @cls, "u-p-3" } elsif ($v eq '"8px 10px"' || $v eq '8') { push @cls, "u-p-2" } elsif ($v eq '24') { push @cls, "u-p-5" } elsif ($v eq '0') { push @cls, "u-p-0" } elsif ($v eq '"12px 0 0"') { push @cls, "u-pt-3" } elsif ($v eq '"0 16px 16px"') { push @cls, "u-p-4", "u-pt-0" } else { return undef } }
  if (defined(my $v = delete $p{paddingTop})) { if ($v eq "0") { push @cls, "u-pt-0" } elsif ($v eq "64") { push @cls, "u-pt-9" } elsif ($v =~ /^\d+$/ && $mt{$v}) { (my $c = $mt{$v}) =~ s/u-mt/u-pt/; push @cls, $c } else { return undef } }
  if (defined(my $v = delete $p{paddingBottom})) { if ($v eq "0") { push @cls, "u-pb-0" } elsif ($v eq "48") { push @cls, "u-pb-8" } elsif ($v eq "72") { push @cls, "u-pb-9" } elsif ($v =~ /^\d+$/ && $mb{$v}) { (my $c = $mb{$v}) =~ s/u-mb/u-pb/; push @cls, $c } else { return undef } }
  if (defined(my $v = delete $p{paddingLeft})) { if ($v =~ /^(16|18|20)$/) { push @cls, "u-pl-4" } elsif ($v eq '10') { push @cls, "u-pl-3" } else { return undef } }
  if (defined(my $v = delete $p{marginRight})) { if ($v =~ /^(6|7|8)$/) { push @cls, "u-mr-2" } elsif ($v eq '"auto"') { push @cls, "u-mr-auto" } else { return undef } }
  if (defined(my $v = delete $p{listStyle})) { return undef unless $v eq '"none"'; push @cls, "u-list-plain"; }
  if (defined(my $v = delete $p{height})) { if ($v =~ /^(6|8|10)$/ && exists $p{borderRadius} && exists $p{background} && $p{background} =~ /line/) { delete $p{borderRadius}; delete $p{background}; delete $p{overflow}; push @cls, "admin-meter", ($v eq '6' ? "admin-meter--thin" : $v eq '10' ? "admin-meter--thick" : ()); } else { return undef } }
  if (exists $p{borderLeft} && $p{borderLeft} =~ /^"2px solid var\(--admin-line(?:-strong)?\)"$/) { delete $p{borderLeft}; delete $p{paddingLeft}; push @cls, "admin-quote"; }
  if (defined(my $v = delete $p{fontSize})) { if ($v =~ /^(10|11)$/) { push @cls, "u-xs" } elsif ($v =~ /^12(\.5)?$/) { push @cls, "u-sm" } elsif ($v =~ /^13(\.5)?$/) { } elsif ($v =~ /^1[45]$/) { push @cls, "u-lg" } else { return undef } }
  if (defined(my $v = delete $p{fontWeight})) { if ($v =~ /^(600|650|700|750|800|"600"|"700")$/) { push @cls, "u-strong" } elsif ($v =~ /^(400|500)$/) { } else { return undef } }
  if (defined(my $v = delete $p{color})) {
    if ($v eq '"var(--admin-muted)"') { push @cls, "u-muted" } elsif ($v eq '"var(--admin-ink-2)"') { push @cls, "u-ink-2" } elsif ($v eq '"var(--admin-ink)"') { push @cls, "u-ink" }
    elsif ($v eq '"var(--admin-err-ink)"') { push @cls, "u-err" } elsif ($v eq '"var(--admin-warn-ink)"') { push @cls, "u-warn" } elsif ($v eq '"var(--admin-ok-ink)"') { push @cls, "u-ok" }
    elsif ($v eq '"inherit"') { push @cls, "u-link-plain" } else { return undef }
  }
  if (defined(my $v = delete $p{textDecoration})) { return undef unless $v eq '"none"'; push @cls, "u-link-plain"; }
  if (defined(my $v = delete $p{textAlign})) { if ($v eq '"right"') { push @cls, "u-right" } elsif ($v eq '"center"') { push @cls, "u-center-text" } else { return undef } }
  if (defined(my $v = delete $p{whiteSpace})) { if ($v eq '"nowrap"') { push @cls, "u-nowrap" } elsif ($v eq '"pre-wrap"') { push @cls, "u-prewrap" } else { return undef } }
  if (defined(my $v = delete $p{flex})) { if ($v =~ /^(1|"1"|"1 1 auto"|"1 1 0")$/) { push @cls, "u-grow" } elsif ($v =~ /^"1 1 1[3-6]0px"$/) { push @cls, "u-flex-1" } elsif ($v =~ /^"2 1 2[0-6]0px"$/) { push @cls, "u-flex-2" } elsif ($v =~ /^"0 0 auto"$/) { push @cls, "u-shrink-0" } else { return undef } }
  if (defined(my $v = delete $p{flexShrink})) { return undef unless $v eq '0'; push @cls, "u-shrink-0"; }
  if (defined(my $v = delete $p{minWidth})) { if ($v eq '0') { push @cls, "u-min-0" } elsif ($v =~ /^(70|80|100|120|130|140)$/) { push @cls, "u-min-1" } elsif ($v =~ /^(150|160|180|200)$/) { push @cls, "u-min-2" } else { return undef } }
  if (defined(my $v = delete $p{minHeight})) { return undef unless $v =~ /^(18|20)$/; }
  if (defined(my $v = delete $p{maxHeight})) { if ($v =~ /^(200|220|240|260)$/) { push @cls, "admin-scroll-sm" } elsif ($v =~ /^(400|480|500)$/) { push @cls, "admin-scroll-md" } elsif ($v =~ /^(600|640)$/) { push @cls, "admin-scroll-lg" } else { return undef } delete $p{overflow}; delete $p{overflowY}; }
  if (exists $p{overflow} && exists $p{textOverflow} && exists $p{whiteSpace} && $p{whiteSpace} eq '"nowrap"') { delete $p{overflow}; delete $p{textOverflow}; delete $p{whiteSpace}; push @cls, "u-truncate"; }
  if (defined(my $v = delete $p{overflow})) { return undef unless $v eq '"hidden"'; push @cls, "u-clip"; }
  if (defined(my $v = delete $p{pointerEvents})) { return undef unless $v eq '"none"'; push @cls, "u-no-events"; }
  delete $p{fontFamily} if exists $p{fontFamily} && $p{fontFamily} eq '"inherit"';
  if (defined(my $v = delete $p{gridTemplateColumns})) { if ($v =~ /repeat\(2,/ || $v eq '"1fr 1fr"') { push @cls, "u-grid-2" } elsif ($v =~ /repeat\(3,/) { push @cls, "u-grid-3" } elsif ($v =~ /repeat\(4,/) { push @cls, "u-grid-4" } else { return undef } }
  if (defined(my $v = delete $p{width})) { if ($v eq '"100%"') { push @cls, "u-w-full" } elsif ($v eq '"auto"') { push @cls, "u-w-auto" } elsif ($v =~ /^(72|80|90|100)$/) { push @cls, "u-w-90" } elsif ($v =~ /^(110|120)$/) { push @cls, "u-w-120" } elsif ($v =~ /^(150|160)$/) { push @cls, "u-w-160" } elsif ($v =~ /^(200|220)$/) { push @cls, "u-w-200" } else { return undef } }
  if (defined(my $v = delete $p{maxWidth})) { if ($v =~ /^(640|"640px")$/) { push @cls, "u-max-form" } elsif ($v =~ /^(880|"880px")$/) { push @cls, "u-max-narrow" } elsif ($v =~ /^(420|"420px")$/) { push @cls, "u-max-sm" } elsif ($v =~ /^(120|130)$/) { push @cls, "u-max-1" } elsif ($v =~ /^(140|150|160)$/) { push @cls, "u-max-2" } elsif ($v =~ /^(180|200|220|240)$/) { push @cls, "u-max-3" } elsif ($v =~ /^(260|280|300)$/) { push @cls, "u-max-4" } elsif ($v =~ /^(320|340|360)$/) { push @cls, "u-max-5" } elsif ($v =~ /^(480|500|520)$/) { push @cls, "u-max-6" } elsif ($v =~ /^(700|720|760)$/) { push @cls, "u-max-7" } elsif ($v =~ /^(84|90|100)$/) { push @cls, "u-max-0" } elsif ($v eq '"68ch"') { push @cls, "u-max-prose" } elsif ($v =~ /^(840|860)$/) { push @cls, "u-max-narrow" } elsif ($v =~ /^(900|920)$/) { push @cls, "u-max-8" } elsif ($v eq '"100%"') { } else { return undef } }
  if (defined(my $v = delete $p{cursor})) { return undef unless $v eq '"pointer"'; push @cls, "u-pointer"; }
  if (defined(my $v = delete $p{wordBreak})) { return undef unless $v eq '"break-all"'; push @cls, "u-break-all"; }
  if (defined(my $v = delete $p{overflowWrap})) { return undef unless $v eq '"anywhere"'; push @cls, "u-break-all"; }
  if (defined(my $v = delete $p{fontVariantNumeric})) { return undef unless $v eq '"tabular-nums"'; push @cls, "u-tabular"; }
  if (defined(my $v = delete $p{lineHeight})) { return undef unless $v =~ /^1\.[3-6]$/; }
  if (defined(my $v = delete $p{opacity})) { if ($v =~ /^0?\.[4-6]$/) { push @cls, "u-dim" } elsif ($v =~ /^0?\.[78]$/) { push @cls, "u-dim-2" } else { return undef } }
  if (exists $p{textTransform} && exists $p{letterSpacing}) { delete $p{textTransform}; delete $p{letterSpacing}; push @cls, "u-label"; @cls = grep { $_ ne "u-sm" && $_ ne "u-strong" } @cls; }
  if (exists $p{borderRadius} && exists $p{border} && $p{border} =~ /var\(--admin-line(?:-soft)?\)/ && $p{borderRadius} =~ /^(8|10|12)$/) { delete $p{borderRadius}; delete $p{border}; push @cls, "admin-box"; }
  if (defined(my $v = delete $p{borderTop})) { return undef unless $v =~ /^"1px solid var\(--admin-line(?:-soft)?\)"$/; push @cls, "admin-divider-top"; @cls = grep { !/^u-(mt|pt)-/ } @cls; }
  if (defined(my $v = delete $p{alignSelf})) { if ($v eq '"flex-start"') { push @cls, "u-self-start" } elsif ($v eq '"flex-end"') { push @cls, "u-self-end" } else { return undef } }
  if (defined(my $v = delete $p{objectFit})) { return undef; }
  return undef if %p;               # anything else unmapped → leave for hand review
  my %seen; @cls = grep { !$seen{$_}++ } @cls;
  return join " ", @cls;
}

sub convert_line {
  my ($line) = @_;
  return $line unless $line =~ /style=\{\{([^{}]*)\}\}/;
  return $line if $line =~ /layout-ok/;
  my $body = $1;
  my $cls = map_props($body);
  return $line unless defined $cls;
  return $line if $cls eq "" && $body =~ /\S/ && $body !~ /^\s*(lineHeight|fontWeight: [45]00|fontSize: 13(\.5)?)/;
  # Merge into the element's className on the same line.
  if ($line =~ /className="([^"]*)"/) {
    my $existing = $1;
    $line =~ s/ style=\{\{[^{}]*\}\}//;
    $line =~ s/className="\Q$existing\E"/className="$existing $cls"/ if $cls ne "";
  } elsif ($line =~ /className=\{`([^`]*)`\}/) {
    my $existing = $1;
    $line =~ s/ style=\{\{[^{}]*\}\}//;
    $line =~ s/className=\{`\Q$existing\E`\}/className={`$existing $cls`}/ if $cls ne "";
  } elsif ($line =~ /className=\{([^{}`]+)\}/) {
    my $expr = $1;
    $line =~ s/ style=\{\{[^{}]*\}\}//;
    $line =~ s/className=\{\Q$expr\E\}/className={`\${$expr} $cls`}/ if $cls ne "";
  } elsif ($line =~ /^(\s*)style=\{\{[^{}]*\}\}\s*$/) {
    # attribute on its own line: only safe when no className elsewhere on the element — skip (hand review)
    return $line;
  } else {
    $line =~ s/ style=\{\{[^{}]*\}\}/ className="$cls"/ if $cls ne "";
    $line =~ s/ style=\{\{[^{}]*\}\}// if $cls eq "";
  }
  return $line;
}

my @lines = map { convert_line($_) } split /(?<=\n)/, $src;

# 2. `style={{ … }}` as an attribute on its own line: merge into the element's
#    className line (searching back to the element's opening `<Tag`), or turn
#    the line itself into a className attribute when the element has none.
for (my $i = 0; $i < @lines; $i++) {
  next unless $lines[$i] =~ /^(\s*)style=\{\{([^{}]*)\}\}\s*$/;
  my ($indent, $body) = ($1, $2);
  my $cls = map_props($body);
  next unless defined $cls && $cls ne "";
  my $merged = 0;
  for (my $j = $i - 1; $j >= 0 && $j > $i - 25; $j--) {
    last if $lines[$j] =~ /^\s*<[A-Za-z]/ && $lines[$j] !~ /className=/ && $j != $i - 1 && 0;
    if ($lines[$j] =~ /className="([^"]*)"/) { my $e = $1; $lines[$j] =~ s/className="\Q$e\E"/className="$e $cls"/; $merged = 1; last; }
    if ($lines[$j] =~ /className=\{`([^`]*)`\}/) { my $e = $1; $lines[$j] =~ s/className=\{`\Q$e\E`\}/className={`$e $cls`}/; $merged = 1; last; }
    if ($lines[$j] =~ /className=\{([^{}`]+)\}/) { my $e = $1; $lines[$j] =~ s/className=\{\Q$e\E\}/className={`\${$e} $cls`}/; $merged = 1; last; }
    last if $lines[$j] =~ /^\s*<[A-Za-z][\w.]*\s*$/ || $lines[$j] =~ /^\s*<[A-Za-z][\w.]*\s+[^>]*$/ && $lines[$j] !~ /=/ ;
    last if $lines[$j] =~ /^\s*<[A-Za-z]/;
  }
  if ($merged) { splice @lines, $i, 1; $i--; }
  else { $lines[$i] = "${indent}className=\"$cls\"\n"; }
}
print join "", @lines;
