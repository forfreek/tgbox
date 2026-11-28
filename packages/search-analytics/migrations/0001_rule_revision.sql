-- Rule mutation invalidates every derived publication, regardless of the caller.
CREATE TRIGGER search_rules_insert_revision AFTER INSERT ON search_keyword_rules
BEGIN UPDATE search_control SET rules_revision=rules_revision+1 WHERE id=1; END;
CREATE TRIGGER search_rules_update_revision AFTER UPDATE ON search_keyword_rules
BEGIN UPDATE search_control SET rules_revision=rules_revision+1 WHERE id=1; END;
CREATE TRIGGER search_rules_delete_revision AFTER DELETE ON search_keyword_rules
BEGIN UPDATE search_control SET rules_revision=rules_revision+1 WHERE id=1; END;
