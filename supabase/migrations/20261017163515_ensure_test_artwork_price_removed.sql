update public.artworks
set price_a5_paise = null, is_test = false
where artist = 'Preethi' and title = 'A little nostalgia';

update public.artworks
set is_test = false
where is_test = true;
