-- fork-schema-upgrade: 20261118090000 -> 20261118090500
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run. CI's fork job proves it: it replays the baseline plus every delta
-- and requires a pg_dump equal to a fresh install of 01-schema.sql version
-- 20261118090500. Apply with scripts/fork-upgrade.sh, which runs it in one
-- transaction and records the new version; README Step 3b.
--
-- What changed upstream (campaign images, PR #2723): migration
-- 20261118090500 adds three columns to company_os.brand_profiles (two logo
-- paths and channel_templates, an object that defaults to empty) and two to
-- company_os.marketing_asset_images (art_url and card), each with a comment,
-- and three checks. No row is written; existing rows take the defaults.

alter table company_os.brand_profiles
  add column if not exists logo_on_dark_path text,
  add column if not exists logo_on_light_path text,
  add column if not exists channel_templates jsonb not null default '{}'::jsonb,
  add constraint brand_profiles_logo_paths_not_blank
    check (
      (logo_on_dark_path is null or length(btrim(logo_on_dark_path)) > 0)
      and (logo_on_light_path is null or length(btrim(logo_on_light_path)) > 0)
    ),
  add constraint brand_profiles_channel_templates_is_object
    check (jsonb_typeof(channel_templates) = 'object');

alter table company_os.marketing_asset_images
  add column if not exists art_url text,
  add column if not exists card jsonb,
  add constraint marketing_asset_images_card_is_object
    check (card is null or jsonb_typeof(card) = 'object');

comment on column company_os.brand_profiles.logo_on_dark_path is 'The brand logo for dark grounds, as a path in the public marketing storage bucket; stamped by code on campaign images, never painted by the model or recoloured. Null means the logo shipped in the app.';
comment on column company_os.brand_profiles.logo_on_light_path is 'The brand logo for light grounds, as a path in the public marketing storage bucket. Null means the logo shipped in the app.';
comment on column company_os.brand_profiles.channel_templates is 'Per channel, the image layout (1, 2 or 4) and the arrangements the writer may choose from, e.g. {"linkedin": {"layout": 4, "arrangements": ["steps", "headline"]}}. Empty object means the defaults in code.';
comment on column company_os.marketing_asset_images.art_url is 'The image model''s art alone, before the colour pass and the words, so a word can be changed and the card re-rendered with no new model call. Null for older versions and images with no model art.';
comment on column company_os.marketing_asset_images.card is 'What the renderer drew for this version: brand, layout, format, arrangement, size, logo, the exact words, where the layout was chosen, and the colours before and after the colour pass. Null for older versions.';
