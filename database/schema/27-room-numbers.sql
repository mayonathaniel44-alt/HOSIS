-- Keep the occupied room-number range unique while preserving every room ID.
UPDATE rooms
SET room_number = CASE room_number
  WHEN 'DEMO-101' THEN '116'
  WHEN 'DEMO-102' THEN '117'
  WHEN 'DEMO-103' THEN '118'
  WHEN 'DEMO-104' THEN '119'
  ELSE substring(room_number FROM 6)
END
WHERE room_number ~ '^DEMO-(10[1-9]|11[0-5])$';
