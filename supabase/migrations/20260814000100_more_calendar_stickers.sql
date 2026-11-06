-- Expand the client sticker catalogue while keeping the database allow-list explicit.
alter table public.calendar_stickers
  drop constraint calendar_stickers_sticker_key_check;

alter table public.calendar_stickers
  add constraint calendar_stickers_sticker_key_check check (
    sticker_key in (
      'morning-reader',
      'garden-sprout',
      'star-celebration',
      'rainy-window',
      'heart-rest',
      'autumn-picnic',
      'cake-party',
      'flower-gift',
      'beach-day',
      'moon-sleep',
      'happy-baking',
      'workout-cheer'
    )
  );
