import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PlatformLayout from './PlatformLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import PlatformDashboard from './pages/PlatformDashboard';
import PlaceholderPage from './pages/PlaceholderPage';
import AccountPage from './pages/AccountPage';
import ViolationsList from './pages/ViolationsList';
import ViolationDetail from './pages/ViolationDetail';
import AnnouncementsList from './pages/AnnouncementsList';
import AnnouncementDetail from './pages/AnnouncementDetail';
import AnnouncementForm from './pages/AnnouncementForm';
import MaintenanceList from './pages/MaintenanceList';
import SubmitMaintenanceForm from './pages/SubmitMaintenanceForm';
import MaintenanceDetail from './pages/MaintenanceDetail';
import ParcelsList from './pages/ParcelsList';
import EventsPage from './pages/EventsPage';
import DirectoryPage from './pages/DirectoryPage';
import AmenityListing from './pages/AmenityListing';
import ConsentPage from './pages/ConsentPage';
import ReportViolationForm from './pages/ReportViolationForm';
import SearchPage from './pages/SearchPage';
import DocumentsPage from './pages/DocumentsPage';
import PaymentManagement from './pages/PaymentManagement';
import PaymentHistory from './pages/PaymentHistory';
import VisitorRegistration from './pages/VisitorRegistration';
import VisitorCheckIn from './pages/VisitorCheckIn';
import EventDetail from './pages/EventDetail';
import EventForm from './pages/EventForm';
import AmenityManagement from './pages/AmenityManagement';
import MyBookings from './pages/MyBookings';
import AmenityDetail from './pages/AmenityDetail';
import TrainingLibrary from './pages/TrainingLibrary';
import BookingFlow from './pages/BookingFlow';
import SurveyList from './pages/SurveyList';
import SurveyRespond from './pages/SurveyRespond';
import LogParcelForm from './pages/LogParcelForm';
import ParcelPickup from './pages/ParcelPickup';
import ForumPage from './pages/ForumPage';
import MarketplaceForm from './pages/MarketplaceForm';
import MarketplaceBrowse from './pages/MarketplaceBrowse';
import MarketplaceDetail from './pages/MarketplaceDetail';
import ForumThreadDetail from './pages/ForumThreadDetail';
import CreateForumThread from './pages/CreateForumThread';
import SurveyForm from './pages/SurveyForm';
import DocumentManagement from './pages/DocumentManagement';
import SurveyResults from './pages/SurveyResults';
import ConsentManagement from './pages/ConsentManagement';
import AssistantPage from './pages/AssistantPage';
import ShiftSchedule from './pages/ShiftSchedule';
import BrandingEditor from './pages/admin/BrandingEditor';

export default function PlatformRouter() {
  const location = useLocation();

  return (
    <PlatformLayout>
      <ErrorBoundary key={location.pathname} message="Something went wrong loading this page.">
        <Routes>
          <Route index element={<PlatformDashboard />} />
          <Route path="announcements" element={<AnnouncementsList />} />
          <Route path="announcements/new" element={<AnnouncementForm />} />
          <Route path="announcements/:id" element={<AnnouncementDetail />} />
          <Route path="announcements/:id/edit" element={<AnnouncementForm />} />
          <Route path="maintenance" element={<MaintenanceList />} />
          <Route path="maintenance/new" element={<SubmitMaintenanceForm />} />
          <Route path="maintenance/:id" element={<MaintenanceDetail />} />
          <Route path="amenities" element={<AmenityListing />} />
          <Route path="amenities/:id" element={<AmenityDetail />} />
          <Route path="amenities/manage" element={<AmenityManagement />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/new" element={<EventForm />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="events/:id/edit" element={<EventForm />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="bookings/new" element={<BookingFlow />} />
          <Route path="visitors" element={<VisitorRegistration />} />
          <Route path="visitors/desk" element={<VisitorCheckIn />} />
          <Route path="violations" element={<ViolationsList />} />
          <Route path="violations/new" element={<ReportViolationForm />} />
          <Route path="violations/:id" element={<ViolationDetail />} />
          <Route path="payments" element={<PaymentHistory />} />
          <Route path="payments/manage" element={<PaymentManagement />} />
          <Route path="parcels" element={<ParcelsList />} />
          <Route path="parcels/new" element={<LogParcelForm />} />
          <Route path="parcels/:id/pickup" element={<ParcelPickup />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="forum" element={<ForumPage />} />
          <Route path="forum/new" element={<CreateForumThread />} />
          <Route path="forum/:threadId" element={<ForumThreadDetail />} />
          <Route path="marketplace" element={<MarketplaceBrowse />} />
          <Route path="marketplace/new" element={<MarketplaceForm />} />
          <Route path="marketplace/:id" element={<MarketplaceDetail />} />
          <Route path="marketplace/:id/edit" element={<MarketplaceForm />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/manage" element={<DocumentManagement />} />
          <Route path="training" element={<TrainingLibrary />} />
          <Route path="surveys" element={<SurveyList />} />
          <Route path="surveys/new" element={<SurveyForm />} />
          <Route path="surveys/:id" element={<SurveyRespond />} />
          <Route path="surveys/:id/edit" element={<SurveyForm />} />
          <Route path="surveys/:id/results" element={<SurveyResults />} />
          <Route path="consent" element={<ConsentPage />} />
          <Route path="consent/manage" element={<ConsentManagement />} />
          <Route path="shifts" element={<ShiftSchedule />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="admin/branding" element={<BrandingEditor />} />
          {/* Catch-all: redirect unknown platform paths to dashboard */}
          <Route path="*" element={<Navigate to="/platform" replace />} />
        </Routes>
      </ErrorBoundary>
    </PlatformLayout>
  );
}
