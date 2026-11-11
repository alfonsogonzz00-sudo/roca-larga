-- 0014 · Escudos actualizados (Caravelle sin fondo, Monecillo sin cuadrícula); ?v=3 invalida la caché
update public.teams set crest_url = '/crests/' || slug || '.png?v=3' where slug in ('caravelle','monecillo') and (crest_url like '/crests/%' or crest_url is null);
