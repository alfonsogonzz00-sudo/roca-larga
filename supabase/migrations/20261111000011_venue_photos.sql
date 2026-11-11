-- 0011 · Fotos de los estadios (servidas desde /public/venues) y datos confirmados
update public.venues set image_url = '/venues/calasancio.jpg' where name = 'Calasancio';
update public.venues set image_url = '/venues/open-arena.jpg' where name = 'Open Arena';
update public.venues set image_url = '/venues/la-salle.jpg', pitch_info = '3 campos de fútbol 7 (uno algo más pequeño) y 1 de fútbol 11. Desde 56 €/h. Medidas no publicadas.' where name = 'La Salle';
update public.venues set image_url = '/venues/los-abetos.jpg' where name = 'Hotel Los Abetos';
update public.venues set image_url = '/venues/el-carmen.jpg', surface = 'Césped artificial' where name = 'El Carmen';
