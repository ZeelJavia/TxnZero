package org.example.config;

import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class ReplicationRoutingDataSource extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        // If the current transaction is marked as read-only, return "reader"
        // Otherwise, default to "writer"
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly() ? "reader" : "writer";
    }
}