ALTER TABLE `collection_items` ADD `status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
-- 今の「公開する」にしていたものを、新しい状態の「公開」に写す（ほかは未公開＝draft のまま）
UPDATE `collection_items` SET `status` = 'published' WHERE `published` = 1;
