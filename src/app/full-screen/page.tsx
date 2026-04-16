import { ReportsView } from "@/features/reports/ReportsView";
import {
  Card, CardContent, CardDescription,
  CardHeader, CardTitle
} from "@/components/ui/card";

export default function FullScreen() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Reported Bugs</CardTitle>
          <CardDescription>
            Every bug submitted via the JIRA Reporter
            plugin for this tenant, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportsView />
        </CardContent>
      </Card>
    </div>
  );
}
