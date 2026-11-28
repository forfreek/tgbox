-- Dimension rows remain available for analysis, but global daily contribution is unique.
CREATE UNIQUE INDEX search_one_daily_contribution
  ON search_daily_identities(day,keyword,identity) WHERE eligible=1;
