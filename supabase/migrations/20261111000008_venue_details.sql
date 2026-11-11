-- =====================================================================
-- 0008 · Ficha ampliada de estadios + alta de los campos reales de Córdoba
-- Datos recogidos el 11/11/2026 de las webs oficiales y fichas públicas
-- (Google Maps, openarena.es, sportcordobalasalle.es, Fubles, Páginas Amarillas).
-- Lo que no está publicado se deja vacío: no se inventan medidas.
-- =====================================================================
alter table public.venues
  add column if not exists phone        text check (phone is null or length(phone) <= 40),
  add column if not exists phone_alt    text check (phone_alt is null or length(phone_alt) <= 120),
  add column if not exists website      text check (website is null or website ~* '^https?://'),
  add column if not exists booking_url  text check (booking_url is null or booking_url ~* '^https?://'),
  add column if not exists pitch_info   text check (pitch_info is null or length(pitch_info) <= 200),
  add column if not exists hours        text check (hours is null or length(hours) <= 200),
  add column if not exists latitude     double precision,
  add column if not exists longitude    double precision;

insert into public.venues (name, address, city, maps_url, image_url, surface, phone, phone_alt, website, booking_url, pitch_info, hours, latitude, longitude, notes)
values
('Calasancio',
 'C. Peñarroya-Pueblonuevo, 6 (Norte Sierra), 14012', 'Córdoba',
 'https://www.google.com/maps/search/?api=1&query=Calasancio+Centro+Deportivo+C%C3%B3rdoba&query_place_id=ChIJe_EKHlnfbA0R9zPlPwmYwms',
 null, 'Césped artificial', '+34 652 77 95 39', 'Club C.P. Calasancio (fútbol): 622 09 50 73', 'https://www.calasancio.com', null,
 '1 campo de fútbol 7 junto a las pistas de pádel. Medidas no publicadas.', 'Todos los días, 9:00–23:00',
 37.9118787, -4.7826846,
 'Calasancio Centro Deportivo. Pádel (pista cubierta y descubierta), fútbol 7 y bar.'),
('Open Arena',
 'C. Escritora María Goyri, s/n (Poniente Sur), 14005', 'Córdoba',
 'https://www.google.com/maps/search/?api=1&query=Open+Arena+C%C3%B3rdoba&query_place_id=ChIJSYGS16kgbQ0RRflitr_ZG_w',
 'https://openarena.es/wp-content/uploads/2019/05/open_arena_web_futbol.jpg', 'Césped artificial', '+34 957 23 64 85', 'info@openarena.es',
 'https://openarena.es/alquiler-pista-futbol/', 'https://www.oarenareservas.omesa.es',
 '3 campos de fútbol 7 y 1 de fútbol 11. Medidas no publicadas.', 'L–V 7:00–23:00 · S–D 9:00–14:00 y 17:00–22:00',
 37.8807582, -4.8026094,
 'Centro Deportivo Municipal Open Arena. Reserva online o por teléfono.'),
('La Salle',
 'Ctra. de las Ermitas, s/n (Norte Sierra), 14012', 'Córdoba',
 'https://www.google.com/maps/search/?api=1&query=Complejo+Deportivo+La+Salle+C%C3%B3rdoba&query_place_id=ChIJ0VAIvCLfbA0RpVyc2LBRfy4',
 null, 'Césped artificial', '+34 681 65 90 88', 'Club de pádel: 605 82 72 57 · La Salle Sport: 623 14 22 27',
 'https://sites.google.com/sportcordobalasalle.es/info', null,
 'Varios campos de fútbol 7 y uno de fútbol 11. Alquiler aprox. 47 €/h (según reseñas). Medidas no publicadas.', 'L–S 9:00–23:00 · Domingo cerrado (complejo)',
 37.9094344, -4.8028165,
 'Complejo Deportivo La Salle (pádel y fútbol), dentro del colegio. Aparcamiento, vestuarios y bar.'),
('Hotel Los Abetos',
 'Av. de San José de Calasanz, km 2,8 (Norte Sierra), 14012', 'Córdoba',
 'https://www.google.com/maps/search/?api=1&query=Campo+de+f%C3%BAtbol+Los+Abetos+C%C3%B3rdoba&query_place_id=ChIJY_9_IszfbA0RCkdH41_-riE',
 null, 'Césped artificial', '+34 957 76 70 63', null, 'https://fincalosabetos.es', null,
 'Campo pequeño con muros perimetrales (más bien para 6 contra 6). Mejor botas de multitaco. Medidas no publicadas.', null,
 37.9256944, -4.7905859,
 'Campo de fútbol del Hotel Finca Los Abetos, en la sierra.'),
('El Carmen',
 'C. Alonso el Sabio, 34 (Centro), 14001', 'Córdoba',
 'https://www.google.com/maps/search/?api=1&query=Club+Deportivo+El+Carmen+C%C3%B3rdoba&query_place_id=ChIJdVGLu3DfbA0RlpiSFtpSihg',
 null, null, '+34 674 28 40 99', null, 'https://www.instagram.com/cdelcarmencordoba/', null,
 'Campos de fútbol 7 (también fútbol 10 y 11). Medidas y superficie no publicadas.', 'L–J 16:00–24:00 · V 13:00–24:00 · S–D 9:00–24:00',
 37.8950071, -4.7743657,
 'Club Deportivo El Carmen. Aparcamiento privado y bar.')
on conflict (name) do nothing;
