-- 0015 · Estadio IDM Fontanar (campo de fútbol del Parque Cruz Conde, IMDECO)
-- Fuentes: imdcordoba.es (ficha «I.D.M. C.F. Fontanar» y díptico de horarios 2024/25), Google Maps.
insert into public.venues (name, address, city, maps_url, image_url, surface, phone, phone_alt, website, booking_url, pitch_info, hours, latitude, longitude, notes)
values (
 'IDM Fontanar',
 'C. Padre Morales, esq. Castelló d''Empúries, s/n (Poniente Sur), 14005', 'Córdoba',
 'https://www.google.com/maps/search/?api=1&query=37.8721142,-4.7959641',
 '/venues/fontanar.jpg', 'Césped artificial', '+34 957 20 29 00',
 'IMDECO (oficinas, L–V 8:00–15:00): 957 75 33 33 · fontanar@imdcordoba.es',
 'https://www.imdcordoba.es/campo-futbol-fontanar/', null,
 'Campo de fútbol 11 con líneas de fútbol 7 en transversal (se juega a lo ancho). Medidas no publicadas. Tarifas en imdcordoba.es/precios.',
 'L–V 8:00–22:30 · S 9:00–14:00 y 16:00–20:00 · D 9:00–14:00 (instalación)',
 37.8721142, -4.7959641,
 'Instalación Deportiva Municipal (IMDECO), junto al estadio y la pista de atletismo de El Fontanar. Reserva por teléfono o en la propia instalación.')
on conflict (name) do nothing;
