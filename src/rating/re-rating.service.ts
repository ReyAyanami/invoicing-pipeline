import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RatingService } from './rating.service';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../kafka/constants';
import { EachMessagePayload } from 'kafkajs';

@Injectable()
export class ReRatingService implements OnModuleInit {
    private readonly logger = new Logger(ReRatingService.name);

    constructor(
        private readonly ratingService: RatingService,
        private readonly kafkaService: KafkaService,
    ) { }

    async onModuleInit() {
        await this.startConsumer();
    }

    private async startConsumer() {
        await this.kafkaService.createConsumer(
            're-rating-group',
            [KAFKA_TOPICS.LATE_EVENTS],
            async (payload: EachMessagePayload) => {
                const event = JSON.parse(payload.message.value?.toString() || '{}');
                await this.handleLateEvent(event);
            },
        );
    }

    /**
     * Handle a late event by creating a new delta charge
     */
    private async handleLateEvent(event: any) {
        this.logger.log(`Processing late event for re-rating: ${event.eventId}`);

        const metricType = event.eventType;
        const value = event.metadata?.value?.toString() ?? '1';

        try {
            await this.ratingService.rateUsage({
                customerId: event.customerId,
                metricType,
                quantity: value,
                effectiveDate: event.eventTime,
                aggregatedUsageId: undefined as any, // Delta charges aren't linked to a specific fixed window
            });

            this.logger.log(`Successfully created re-rating charge for event ${event.eventId}`);
        } catch (error: any) {
            this.logger.error(`Failed to process late event ${event.eventId}: ${error.message}`);
        }
    }
}
