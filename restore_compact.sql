CREATE TABLE IF NOT EXISTS masters_backup (id INTEGER PRIMARY KEY, max_chat_id TEXT);
INSERT INTO masters_backup (id, max_chat_id) VALUES
(75, '177069363'),
(8, '34875967'),
(55, '227580497'),
(82, '296679744'),
(27, '103381985'),
(22, '210083397'),
(53, '40429222'),
(66, '63702878'),
(45, '121012346'),
(85, '56358355'),
(84, '237906293'),
(43, '251556579'),
(29, '230758230'),
(17, '212145904'),
(63, '143076568'),
(13, '166263535'),
(10, '230292195'),
(50, '15264468'),
(19, '229815303'),
(37, '174679069'),
(41, '63316606'),
(71, '147552361'),
(33, '139479319'),
(65, '38737507'),
(59, '38162169'),
(26, '27217516'),
(44, '72105214'),
(47, '149086545'),
(73, '75918363'),
(42, '30602928'),
(61, '264616165'),
(60, '71744093'),
(56, '155559738'),
(16, '187999656'),
(35, '113754124'),
(38, '100043759')
;

UPDATE masters m
SET max_chat_id = b.max_chat_id
FROM masters_backup b
WHERE m.id = b.id
  AND b.max_chat_id IS NOT NULL
  AND b.max_chat_id != '';

SELECT COUNT(*) AS restored_count
FROM masters
WHERE max_chat_id IS NOT NULL AND max_chat_id != '';

DROP TABLE masters_backup;