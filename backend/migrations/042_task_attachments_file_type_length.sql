-- task_attachments.file_type stocke le type MIME du fichier, limité à 50 caractères. Or les
-- formats Office actuels le dépassent :
--   .docx  application/vnd.openxmlformats-officedocument.wordprocessingml.document  (71)
--   .xlsx  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet         (65)
-- L'insertion échouait donc : joindre un Word ou un Excel à une tâche ou à un commentaire
-- répondait « Internal server error », alors que ces formats sont proposés à l'import.
-- 150, comme resources_files.mime_type. Agrandir un varchar ne réécrit pas la table.
ALTER TABLE task_attachments ALTER COLUMN file_type TYPE varchar(150);
