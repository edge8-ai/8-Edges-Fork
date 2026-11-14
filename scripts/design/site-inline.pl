#!/usr/bin/env perl
# Usage: perl scripts/design/site-inline.pl < page.tsx > out.tsx
# Public-site pre-pass (app/workflows and the marketing pages): exact-pattern
# substitutions for the section bands and lead paragraphs the workflow library
# repeats on every page. Run before smart-inline.pl, then `npx tsc`.
use strict; use warnings;
sub merge { my ($line, $cls) = @_;
  if ($line =~ /className="([^"]*)"/) { my $e = $1; $line =~ s/className="\Q$e\E"/className="$e $cls"/; $line =~ s/ style=\{\{[^{}]*\}\}//; }
  else { $line =~ s/ style=\{\{[^{}]*\}\}/ className="$cls"/; }
  return $line; }
while (my $line = <STDIN>) {
  my $b = $line; $b =~ s/'/"/g;
  if ($b =~ /style=\{\{ background: "var\(--white\)" \}\}/) { $line = merge($line, "wf-section--white"); }
  elsif ($b =~ /style=\{\{ background: "var\(--tint\)", padding: "72px 0" \}\}/) { $line = merge($line, "wf-section--tint"); }
  elsif ($b =~ /style=\{\{ background: "var\(--dark\)", padding: "72px 0" \}\}/) { $line = merge($line, "wf-section--dark"); }
  elsif ($b =~ /style=\{\{ background: "var\(--dark\)", padding: "64px 0" \}\}/) { $line = merge($line, "wf-section--dark-sm"); }
  elsif ($b =~ /style=\{\{ marginTop: 32, fontSize: 15, color: "var\(--body-text\)" \}\}/) { $line = merge($line, "wf-lead u-mt-6"); }
  elsif ($b =~ /style=\{\{ fontSize: 14, opacity: 0\.85 \}\}/) { $line = merge($line, "u-lg wf-dim"); }
  elsif ($b =~ /style=\{\{ color: "var\(--blue\)", fontWeight: 600 \}\}/) { $line = merge($line, "wf-link-accent"); }
  elsif ($b =~ /style=\{\{ color: "var\(--blue\)" \}\}/) { $line = merge($line, "u-accent"); }
  elsif ($b =~ /style=\{\{ color: "var\(--grey-mid\)", textDecoration: "none" \}\}/) { $line = merge($line, "wf-link-muted"); }
  elsif ($b =~ /style=\{\{ border: "1px solid var\(--card-border\)", borderRadius: 20, overflow: "hidden", marginTop: 32 \}\}/) { $line = merge($line, "wf-figure u-mt-6"); }
  elsif ($b =~ /style=\{\{ minWidth: 760, width: "100%", height: "auto", display: "block", fontFamily: "inherit" \}\}/) { $line = merge($line, "wf-diagram wf-diagram--wide"); }
  elsif ($b =~ /style=\{\{ display: "block", width: "100%", height: "auto", minWidth: 600 \}\}/) { $line = merge($line, "wf-diagram"); }
  elsif ($b =~ /style=\{\{ fontSize: 32, color: "var\(--white\)" \}\}/) { $line = merge($line, "wf-title-xl"); }
  elsif ($b =~ /style=\{\{ fontSize: 30, marginBottom: 12 \}\}/) { $line = merge($line, "wf-title-lg u-mb-3"); }
  elsif ($b =~ /style=\{\{ fontSize: 22, fontWeight: 700, margin: "48px 0 0" \}\}/) { $line = merge($line, "wf-lead--lg u-m-0 u-mt-8"); }
  elsif ($b =~ /style=\{\{ overflowX: "auto", margin: "40px 0 8px" \}\}/) { $line = merge($line, "u-x-scroll u-mt-7 u-mb-2"); }
  print $line;
}
