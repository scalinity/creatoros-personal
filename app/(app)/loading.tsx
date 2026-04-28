import { Card, EmptyState, RuleHeader } from "@/components/design-system";

export default function Loading() {
  return (
    <main className="route-scaffold" aria-busy="true">
      <RuleHeader folio="§" label="Loading" sub="private workspace" />
      <Card variant="inset">
        <Card.Body>
          <EmptyState
            glyph="※"
            message="The workstation shell is preparing this route. Feature data is not loaded in Phase 04."
            title="LOADING ROUTE SHELL"
          />
        </Card.Body>
      </Card>
    </main>
  );
}
