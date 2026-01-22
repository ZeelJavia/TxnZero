package org.example.config;

import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public class ReplicationRoutingDataSource extends AbstractRoutingDataSource {

    private static final Logger log = LoggerFactory.getLogger(ReplicationRoutingDataSource.class);

    @Override
    protected Object determineCurrentLookupKey() {
        boolean isReadOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();

        // 🚦 VISUAL LOG: Tells you exactly where the query is going
        if (isReadOnly) {
            log.info("🟢 ROUTING TO: REPLICA (Read-Only)");
            return "reader";
        } else {
            log.info("🔴 ROUTING TO: PRIMARY (Write/Critical)");
            return "writer";
        }
    }
}