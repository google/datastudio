// Compiled using ts2gas 1.6.2 (TypeScript 3.4.5)
var exports = exports || {};
var module = module || {exports: exports};
var gkeUsageMetering;
(function(gkeUsageMetering) {
  var requestTableID = 'gke_cluster_resource_usage';
  var consumptionTableID = 'gke_cluster_resource_consumption';
  /**
   * Returns the BigQuery query based on whether consumption-based metering
   * is enabled or not
   * @param gcpBillingExportTableID
   * @param usageExportDatasetID
   * @param startDate
   * @param endDate
   * @param consumptionEnabled
   */
  function generateSQLQuery(
    gcpBillingExportTableID,
    usageExportDatasetID,
    startDate,
    endDate,
    consumptionEnabled
  ) {
    var fullGCPBillingExportTableID = gcpBillingExportTableID.replace(':', '.');
    var fullUsageExportTableID =
      usageExportDatasetID.replace(':', '.') + '.' + requestTableID;
    var fullConsumptionUsageExportTableID =
      usageExportDatasetID.replace(':', '.') + '.' + consumptionTableID;
    var projectID = fullUsageExportTableID.split('.')[0];
    var queryWithRequestOnly =
      '\n    WITH\n    -- Select from the raw GCP billing export table the charges incurred in a\n    -- given GCP project and in the given time interval.\n    billing_table AS (\n    SELECT\n      sku.id AS sku_id,\n      project.id AS project_id,\n      MIN(usage_start_time) AS min_usage_start_time,\n      MAX(usage_end_time) AS max_usage_end_time,\n      SUM(usage.amount) AS amount,\n      usage.unit AS usage_unit,\n      SUM(cost) AS cost,\n      SUM(cost) / SUM(usage.amount) AS rate\n    FROM\n      `' +
      fullGCPBillingExportTableID +
      '`\n    WHERE\n      usage_start_time >= TIMESTAMP("' +
      startDate +
      '")\n      AND usage_end_time <= TIMESTAMP("' +
      endDate +
      '")\n      AND project.id = "' +
      projectID +
      '"\n    GROUP BY\n      project.id,\n      sku.id,\n      usage.unit ),\n    -- Select from the raw resource usage table the resource usage records\n    -- incurred in the given time interval.\n    filtered_resource_usage AS (\n    SELECT\n      resource_usage.cluster_location,\n      resource_usage.cluster_name,\n      resource_usage.end_time,\n      resource_usage.labels,\n      resource_usage.namespace,\n      resource_usage.project.id AS project_id,\n      resource_usage.resource_name,\n      resource_usage.sku_id,\n      resource_usage.start_time,\n      resource_usage.usage.amount AS amount,\n      NULL as amount_with_untracked,\n      billing_table.rate\n    FROM\n      `' +
      fullUsageExportTableID +
      '` AS resource_usage\n    INNER JOIN\n      billing_table\n    ON\n      resource_usage.sku_id = billing_table.sku_id\n      AND resource_usage.project.id = billing_table.project_id\n      AND resource_usage.end_time <= billing_table.max_usage_end_time\n      AND resource_usage.start_time >= billing_table.min_usage_start_time ),\n    aggregated_resource_usage AS (\n    SELECT\n      project_id,\n      sku_id,\n      resource_name,\n      SUM(amount) AS amount\n    FROM\n      filtered_resource_usage\n    GROUP BY\n      project_id,\n      resource_name,\n      sku_id ),\n    -- Calculate the total amount of untracked resources. These include unused\n    -- resources in a GKE cluster (i.e., free CPU cycles and RAM blocks in a GKE\n    -- node), and non-GKE resources.\n    untracked_resource_usage AS (\n    SELECT\n      STRING(NULL) AS cluster_location,\n      STRING(NULL) AS cluster_name,\n      billing_table.max_usage_end_time AS end_time,\n      ARRAY<STRUCT<key STRING, value STRING>>[] AS labels,\n      "unallocated" AS namespace,\n      billing_table.project_id,\n      aggregated_resource_usage.resource_name,\n      billing_table.sku_id,\n      billing_table.min_usage_start_time AS start_time,\n      billing_table.amount - IFNULL(aggregated_resource_usage.amount, 0.0) AS amount,\n      NULL AS amount_with_untracked,\n      billing_table.rate\n    FROM\n      billing_table\n    LEFT JOIN\n      aggregated_resource_usage\n    ON\n      billing_table.sku_id = aggregated_resource_usage.sku_id\n      ),\n    -- Generate a table that contains the usage amount of each unallocated resource_name\n    breakdown_untracked_resource_usage AS (\n      SELECT\n        untracked_resource_usage.resource_name,\n        SUM(amount) AS amount\n      FROM\n        untracked_resource_usage\n      GROUP BY\n        untracked_resource_usage.resource_name\n    ),\n    -- Add breakdown_untracked_resource_usage to filtered_resource_usage and form a new table\n    aggregated_resource_usage_by_resource_name AS (\n      SELECT\n        filtered_resource_usage.resource_name,\n        SUM(filtered_resource_usage.amount) AS amount\n      FROM\n        filtered_resource_usage\n      GROUP BY\n        filtered_resource_usage.resource_name\n    ),\n    -- Allocate unused, but allocated, amount of resources to each SKU\n    filtered_resource_usage_with_unused AS (\n      SELECT\n        filtered_resource_usage.cluster_location,\n        filtered_resource_usage.cluster_name,\n        filtered_resource_usage.end_time,\n        filtered_resource_usage.labels,\n        filtered_resource_usage.namespace,\n        filtered_resource_usage.project_id,\n        filtered_resource_usage.resource_name,\n        filtered_resource_usage.sku_id,\n        filtered_resource_usage.start_time,\n        filtered_resource_usage.amount,\n        (filtered_resource_usage.amount / aggregated_resource_usage_by_resource_name.amount) * breakdown_untracked_resource_usage.amount AS allocate_unused,\n        filtered_resource_usage.rate\n      FROM\n        filtered_resource_usage\n      INNER JOIN\n        aggregated_resource_usage_by_resource_name\n      ON\n        filtered_resource_usage.resource_name = aggregated_resource_usage_by_resource_name.resource_name\n      INNER JOIN\n        breakdown_untracked_resource_usage\n      ON\n        filtered_resource_usage.resource_name = breakdown_untracked_resource_usage.resource_name\n    ),\n    -- Get the total usage amount by the project in the GCP cluster\n    total_used AS (\n      SELECT\n        resource_usage.resource_name,\n        SUM(billing_table.amount) AS amount\n      FROM\n        billing_table\n      INNER JOIN\n        `' +
      fullUsageExportTableID +
      '` AS resource_usage\n      ON\n        resource_usage.project.id = billing_table.project_id\n        AND resource_usage.end_time <= billing_table.max_usage_end_time\n        AND resource_usage.start_time >= billing_table.min_usage_start_time\n      GROUP BY\n        resource_usage.resource_name\n    ),\n    -- Get the total unallocated usage amount\n    unallocated_usage AS (\n      SELECT\n        untracked_resource_usage.resource_name,\n        SUM(untracked_resource_usage.amount) AS amount\n      FROM\n        untracked_resource_usage\n      WHERE\n        untracked_resource_usage.namespace = "unallocated"\n      GROUP BY\n        untracked_resource_usage.resource_name\n    ),\n    -- Spread the unallocated usage amount to each SKU\n    filtered_resource_usage_with_unused_and_unallocated AS (\n      SELECT\n        filtered_resource_usage_with_unused.cluster_location,\n        filtered_resource_usage_with_unused.cluster_name,\n        filtered_resource_usage_with_unused.end_time,\n        filtered_resource_usage_with_unused.labels,\n        filtered_resource_usage_with_unused.namespace,\n        filtered_resource_usage_with_unused.project_id,\n        filtered_resource_usage_with_unused.resource_name,\n        filtered_resource_usage_with_unused.sku_id,\n        filtered_resource_usage_with_unused.start_time,\n        filtered_resource_usage_with_unused.amount,\n        filtered_resource_usage_with_unused.amount + filtered_resource_usage_with_unused.allocate_unused + unallocated_usage.amount * (filtered_resource_usage_with_unused.amount / total_used.amount) AS amount_with_untracked,\n        filtered_resource_usage_with_unused.rate\n      FROM\n        filtered_resource_usage_with_unused\n      INNER JOIN\n        total_used\n      ON\n        total_used.resource_name = filtered_resource_usage_with_unused.resource_name\n      INNER JOIN\n        unallocated_usage\n      ON unallocated_usage.resource_name = filtered_resource_usage_with_unused.resource_name\n  \n    ),\n    -- Generate the cost breakdown table.\n    request_based_cost_allocation AS (\n    SELECT\n      resource_usage.cluster_location,\n      resource_usage.cluster_name,\n      FORMAT_TIMESTAMP(\'%Y%m%d\', resource_usage.end_time) AS usage_end_time,\n      resource_usage.labels,\n      resource_usage.namespace,\n      resource_usage.resource_name,\n      NULL AS resource_name_with_type_and_unit,\n      resource_usage.sku_id,\n      FORMAT_TIMESTAMP(\'%Y%m%d\', resource_usage.start_time) AS usage_start_time,\n      resource_usage.amount AS amount,\n      0 AS amount_in_pricing_units,\n      resource_usage.amount * resource_usage.rate AS cost,\n      resource_usage.amount_with_untracked * resource_usage.rate AS cost_with_unallocated_untracked,\n      "request" AS type\n    FROM (\n      SELECT\n        *\n      FROM\n        untracked_resource_usage\n      UNION ALL\n      SELECT\n        *\n      FROM\n        filtered_resource_usage_with_unused_and_unallocated ) AS resource_usage\n    )\n  SELECT\n    *\n  FROM\n    request_based_cost_allocation\n    ';
    var queryWithConsumptionEnabled =
      '\n    WITH\n    -- Select from the raw GCP billing export table the charges incurred in a\n    -- given GCP project and in the given time interval.\n    billing_table AS (\n    SELECT\n      sku.id AS sku_id,\n      project.id AS project_id,\n      MIN(usage_start_time) AS min_usage_start_time,\n      MAX(usage_end_time) AS max_usage_end_time,\n      SUM(usage.amount) AS amount,\n      usage.unit AS usage_unit,\n      SUM(cost) AS cost,\n      SUM(cost) / SUM(usage.amount) AS rate\n    FROM\n      `' +
      fullGCPBillingExportTableID +
      '`\n    WHERE\n      usage_start_time >= TIMESTAMP("' +
      startDate +
      '")\n      AND usage_end_time <= TIMESTAMP("' +
      endDate +
      '")\n      AND project.id = "' +
      projectID +
      '"\n    GROUP BY\n      project.id,\n      sku.id,\n      usage.unit ),\n    -- Select from the raw resource usage table the resource usage records\n    -- incurred in the given time interval.\n    filtered_resource_usage AS (\n    SELECT\n      resource_usage.cluster_location,\n      resource_usage.cluster_name,\n      resource_usage.end_time,\n      resource_usage.labels,\n      resource_usage.namespace,\n      resource_usage.project.id AS project_id,\n      resource_usage.resource_name,\n      resource_usage.sku_id,\n      resource_usage.start_time,\n      resource_usage.usage.amount AS amount,\n      NULL as amount_with_untracked,\n      billing_table.rate\n    FROM\n      `' +
      fullUsageExportTableID +
      '` AS resource_usage\n    INNER JOIN\n      billing_table\n    ON\n      resource_usage.sku_id = billing_table.sku_id\n      AND resource_usage.project.id = billing_table.project_id\n      AND resource_usage.end_time <= billing_table.max_usage_end_time\n      AND resource_usage.start_time >= billing_table.min_usage_start_time ),\n    aggregated_resource_usage AS (\n    SELECT\n      project_id,\n      sku_id,\n      resource_name,\n      SUM(amount) AS amount\n    FROM\n      filtered_resource_usage\n    GROUP BY\n      project_id,\n      resource_name,\n      sku_id ),\n    -- Calculate the total amount of untracked resources. These include unused\n    -- resources in a GKE cluster (i.e., free CPU cycles and RAM blocks in a GKE\n    -- node), and non-GKE resources.\n    untracked_resource_usage AS (\n    SELECT\n      STRING(NULL) AS cluster_location,\n      STRING(NULL) AS cluster_name,\n      billing_table.max_usage_end_time AS end_time,\n      ARRAY<STRUCT<key STRING, value STRING>>[] AS labels,\n      "unallocated" AS namespace,\n      billing_table.project_id,\n      aggregated_resource_usage.resource_name,\n      billing_table.sku_id,\n      billing_table.min_usage_start_time AS start_time,\n      billing_table.amount - IFNULL(aggregated_resource_usage.amount, 0.0) AS amount,\n      NULL AS amount_with_untracked,\n      billing_table.rate\n    FROM\n      billing_table\n    LEFT JOIN\n      aggregated_resource_usage\n    ON\n      billing_table.sku_id = aggregated_resource_usage.sku_id\n      ),\n    -- Generate a table that contains the usage amount of each unallocated resource_name\n    breakdown_untracked_resource_usage AS (\n      SELECT\n        untracked_resource_usage.resource_name,\n        SUM(amount) AS amount\n      FROM\n        untracked_resource_usage\n      GROUP BY\n        untracked_resource_usage.resource_name\n    ),\n    -- Add breakdown_untracked_resource_usage to filtered_resource_usage and form a new table\n    aggregated_resource_usage_by_resource_name AS (\n      SELECT\n        filtered_resource_usage.resource_name,\n        SUM(filtered_resource_usage.amount) AS amount\n      FROM\n        filtered_resource_usage\n      GROUP BY\n        filtered_resource_usage.resource_name\n    ),\n    -- Allocate unused, but allocated, amount of resources to each SKU\n    filtered_resource_usage_with_unused AS (\n      SELECT\n        filtered_resource_usage.cluster_location,\n        filtered_resource_usage.cluster_name,\n        filtered_resource_usage.end_time,\n        filtered_resource_usage.labels,\n        filtered_resource_usage.namespace,\n        filtered_resource_usage.project_id,\n        filtered_resource_usage.resource_name,\n        filtered_resource_usage.sku_id,\n        filtered_resource_usage.start_time,\n        filtered_resource_usage.amount,\n        (filtered_resource_usage.amount / aggregated_resource_usage_by_resource_name.amount) * breakdown_untracked_resource_usage.amount AS allocate_unused,\n        filtered_resource_usage.rate\n      FROM\n        filtered_resource_usage\n      INNER JOIN\n        aggregated_resource_usage_by_resource_name\n      ON\n        filtered_resource_usage.resource_name = aggregated_resource_usage_by_resource_name.resource_name\n      INNER JOIN\n        breakdown_untracked_resource_usage\n      ON\n        filtered_resource_usage.resource_name = breakdown_untracked_resource_usage.resource_name\n    ),\n    -- Get the total usage amount by the project in the GCP cluster\n    total_used AS (\n      SELECT\n        resource_usage.resource_name,\n        SUM(billing_table.amount) AS amount\n      FROM\n        billing_table\n      INNER JOIN\n        `' +
      fullUsageExportTableID +
      "` AS resource_usage\n      ON\n        resource_usage.project.id = billing_table.project_id\n        AND resource_usage.end_time <= billing_table.max_usage_end_time\n        AND resource_usage.start_time >= billing_table.min_usage_start_time\n      GROUP BY\n        resource_usage.resource_name\n    ),\n    -- Get the total unallocated usage amount\n    unallocated_usage AS (\n      SELECT\n        untracked_resource_usage.resource_name,\n        SUM(untracked_resource_usage.amount) AS amount\n      FROM\n        untracked_resource_usage\n      WHERE\n        untracked_resource_usage.namespace = \"unallocated\"\n      GROUP BY\n        untracked_resource_usage.resource_name\n    ),\n    -- Spread the unallocated usage amount to each SKU\n    filtered_resource_usage_with_unused_and_unallocated AS (\n      SELECT\n        filtered_resource_usage_with_unused.cluster_location,\n        filtered_resource_usage_with_unused.cluster_name,\n        filtered_resource_usage_with_unused.end_time,\n        filtered_resource_usage_with_unused.labels,\n        filtered_resource_usage_with_unused.namespace,\n        filtered_resource_usage_with_unused.project_id,\n        filtered_resource_usage_with_unused.resource_name,\n        filtered_resource_usage_with_unused.sku_id,\n        filtered_resource_usage_with_unused.start_time,\n        filtered_resource_usage_with_unused.amount,\n        filtered_resource_usage_with_unused.amount + filtered_resource_usage_with_unused.allocate_unused + unallocated_usage.amount * (filtered_resource_usage_with_unused.amount / total_used.amount) AS amount_with_untracked,\n        filtered_resource_usage_with_unused.rate\n      FROM\n        filtered_resource_usage_with_unused\n      INNER JOIN\n        total_used\n      ON\n        total_used.resource_name = filtered_resource_usage_with_unused.resource_name\n      INNER JOIN\n        unallocated_usage\n      ON unallocated_usage.resource_name = filtered_resource_usage_with_unused.resource_name\n  \n    ),\n    -- Generate the cost breakdown table.\n    request_based_cost_allocation AS (\n    SELECT\n      resource_usage.cluster_location,\n      resource_usage.cluster_name,\n      FORMAT_TIMESTAMP('%Y%m%d', resource_usage.end_time) AS usage_end_time,\n      resource_usage.labels,\n      resource_usage.namespace,\n      resource_usage.resource_name,\n      CASE\n        WHEN resource_name = 'cpu' THEN 'CPU requested (CPU hour)'\n        WHEN resource_name = 'memory' THEN 'memory requested (GB hour)'\n      END\n      AS resource_name_with_type_and_unit,\n      resource_usage.sku_id,\n      FORMAT_TIMESTAMP('%Y%m%d', resource_usage.start_time) AS usage_start_time,\n      resource_usage.amount AS amount,\n      CASE\n        WHEN resource_name = 'cpu' THEN amount/3600\n        WHEN resource_name = 'memory' THEN amount/(3600*POW(2,30))\n      END\n      AS amount_in_pricing_units,\n      resource_usage.amount * resource_usage.rate AS cost,\n      resource_usage.amount_with_untracked * resource_usage.rate AS cost_with_unallocated_untracked,\n      \"request\" AS type\n    FROM (\n      SELECT\n        *\n      FROM\n        untracked_resource_usage\n      UNION ALL\n      SELECT\n        *\n      FROM\n        filtered_resource_usage_with_unused_and_unallocated ) AS resource_usage\n    ),\n    consumption_based_cost_allocation AS (\n        WITH\n          filtered_resource_usage AS (\n          SELECT\n            resource_usage.cluster_location,\n            resource_usage.cluster_name,\n            resource_usage.end_time,\n            resource_usage.labels,\n            resource_usage.namespace,\n            resource_usage.project.id AS project_id,\n            resource_usage.resource_name,\n            resource_usage.sku_id,\n            resource_usage.start_time,\n            resource_usage.usage.amount AS amount,\n            billing_table.rate\n          FROM\n            `" +
      fullConsumptionUsageExportTableID +
      "` AS resource_usage\n          INNER JOIN\n            billing_table\n          ON\n            resource_usage.sku_id = billing_table.sku_id\n            AND resource_usage.project.id = billing_table.project_id\n            AND resource_usage.end_time <= billing_table.max_usage_end_time\n            AND resource_usage.start_time >= billing_table.min_usage_start_time ),\n          -- Generate the total amount of resources tracked in the\n          -- `filtered_resource_usage` table.\n          aggregated_resource_usage AS (\n          SELECT\n            project_id,\n            sku_id,\n            resource_name,\n            SUM(amount) AS amount\n          FROM\n            filtered_resource_usage\n          GROUP BY\n            project_id,\n            resource_name,\n            sku_id ),\n          -- Generate the cost breakdown table.\n          cost_allocation AS (\n          SELECT\n            filtered_resource_usage.cluster_location,\n            filtered_resource_usage.cluster_name,\n            FORMAT_TIMESTAMP('%Y%m%d', filtered_resource_usage.end_time) AS usage_end_time,\n            filtered_resource_usage.labels,\n            filtered_resource_usage.namespace,\n            filtered_resource_usage.resource_name,\n            CASE\n              WHEN resource_name = 'cpu' THEN 'CPU consumed (CPU hour)'\n              WHEN resource_name = 'memory' THEN 'memory consumed (GB hour)'\n            END\n            AS resource_name_with_type_and_unit,\n            filtered_resource_usage.sku_id,\n            FORMAT_TIMESTAMP('%Y%m%d', filtered_resource_usage.start_time) AS usage_start_time,\n            filtered_resource_usage.amount AS amount,\n            CASE\n              WHEN resource_name = 'cpu' THEN amount/3600\n              WHEN resource_name = 'memory' THEN amount/(3600*POW(2,30))\n              END\n            AS amount_in_pricing_units,\n            filtered_resource_usage.amount * filtered_resource_usage.rate AS cost,\n            0 AS cost_with_unallocated_untracked,\n            \"consumption\" AS type\n          FROM filtered_resource_usage\n          )\n        SELECT\n          *\n        FROM\n          cost_allocation\n      )\n  SELECT\n    *\n  FROM\n    request_based_cost_allocation\n  UNION ALL\n  SELECT\n    *\n  FROM\n    consumption_based_cost_allocation\n    ";
    if (consumptionEnabled) {
      return queryWithConsumptionEnabled;
    }
    return queryWithRequestOnly;
  }
  gkeUsageMetering.generateSQLQuery = generateSQLQuery;
})(gkeUsageMetering || (gkeUsageMetering = {}));
